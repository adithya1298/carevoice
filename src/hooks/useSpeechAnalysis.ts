import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WordAnalysis {
  word: string;
  status: 'correct' | 'incorrect' | 'skipped';
  score?: number;
}

export interface SpeechAnalysisResult {
  recognizedText: string;
  pronunciationScore: number;
  feedbackMessage: string;
  improvementTip: string;
  mispronounced: string[];
  // Sentence-specific fields
  isSentence: boolean;
  wordAnalysis: WordAnalysis[];
  skippedWords: string[];
  incorrectWords: string[];
  needsWordDrill: boolean;
}

interface UseSpeechAnalysisReturn {
  isAnalyzing: boolean;
  analyzeResult: SpeechAnalysisResult | null;
  error: string | null;
  analyzeSpeech: (audioBlob: Blob, expectedText: string) => Promise<SpeechAnalysisResult | null>;
  resetAnalysis: () => void;
}

// Analyze sentence by comparing expected vs recognized words
const analyzeWords = (expectedText: string, recognizedText: string): {
  wordAnalysis: WordAnalysis[];
  skippedWords: string[];
  incorrectWords: string[];
  correctCount: number;
} => {
  const expectedWords = expectedText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const recognizedWords = recognizedText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  
  const wordAnalysis: WordAnalysis[] = [];
  const skippedWords: string[] = [];
  const incorrectWords: string[] = [];
  let correctCount = 0;
  
  // Use Levenshtein distance for fuzzy matching
  const levenshtein = (a: string, b: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  };
  
  // Check similarity (word is correct if 80%+ similar)
  const isSimilar = (expected: string, recognized: string): boolean => {
    if (expected === recognized) return true;
    const maxLen = Math.max(expected.length, recognized.length);
    if (maxLen === 0) return true;
    const distance = levenshtein(expected, recognized);
    const similarity = 1 - distance / maxLen;
    
    // Allow 1 mistake for short words (up to 4 chars) to reduce false negatives
    if (maxLen <= 4 && distance <= 1) return true;
    
    return similarity >= 0.8;
  };
  
  // Find best match for each expected word
  expectedWords.forEach((expectedWord, idx) => {
    // Check if word exists in recognized text (with some tolerance for position)
    const searchRange = recognizedWords.slice(Math.max(0, idx - 2), idx + 3);
    const matchFound = searchRange.some(rw => isSimilar(expectedWord, rw));
    
    if (matchFound) {
      wordAnalysis.push({ word: expectedWord, status: 'correct' });
      correctCount++;
    } else {
      // Check if partially recognized (incorrect) or completely missed (skipped)
      const partialMatch = searchRange.some(rw => 
        rw.includes(expectedWord.slice(0, 3)) || expectedWord.includes(rw.slice(0, 3))
      );
      
      if (partialMatch) {
        wordAnalysis.push({ word: expectedWord, status: 'incorrect' });
        incorrectWords.push(expectedWord);
      } else {
        wordAnalysis.push({ word: expectedWord, status: 'skipped' });
        skippedWords.push(expectedWord);
      }
    }
  });
  
  return { wordAnalysis, skippedWords, incorrectWords, correctCount };
};

export const useSpeechAnalysis = (): UseSpeechAnalysisReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<SpeechAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Calculate basic score locally as a fallback
  const calculateLocalScore = (expected: string, recognized: string): number => {
    if (!recognized) return 0;
    const { wordAnalysis } = analyzeWords(expected, recognized);
    const correctCount = wordAnalysis.filter(w => w.status === 'correct').length;
    return Math.round((correctCount / expected.split(/\s+/).filter(Boolean).length) * 100);
  };

  const analyzeSpeech = async (
    audioBlob: Blob, 
    expectedText: string, 
    localTranscript?: string
  ): Promise<SpeechAnalysisResult | null> => {
    setIsAnalyzing(true);
    setError(null);
    setAnalyzeResult(null);

    const tryAnalysis = async (isRetry = false): Promise<SpeechAnalysisResult | null> => {
      try {
        // Validate audio size before sending (too small = empty/silent)
        if (audioBlob.size < 500) {
           throw new Error("No voice detected in the recording. Please speak clearly and try again.");
        }

        // Determine if this is a sentence (more than 2 words)
        const wordCount = expectedText.split(/\s+/).filter(Boolean).length;
        const isSentence = wordCount > 2;

        // Create form data with audio file and expected text
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('expectedText', expectedText);
        formData.append('isSentence', String(isSentence));

        console.log(`Sending audio for analysis (${isRetry ? 'Retry' : 'Initial'}), size:`, audioBlob.size);

        // Call the edge function
        const { data, error: fnError } = await supabase.functions.invoke('analyze-speech', {
          body: formData,
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        // Analyze words if it's a sentence
        let wordAnalysis: WordAnalysis[] = [];
        let skippedWords: string[] = [];
        let incorrectWords: string[] = [];
        let needsWordDrill = false;

        if (isSentence && data.recognizedText) {
          const analysis = analyzeWords(expectedText, data.recognizedText);
          wordAnalysis = analysis.wordAnalysis;
          skippedWords = analysis.skippedWords;
          incorrectWords = analysis.incorrectWords;
          
          const correctPercent = (analysis.correctCount / wordCount) * 100;
          needsWordDrill = correctPercent < 60 || (skippedWords.length + incorrectWords.length) >= 2;
        }

        const result: SpeechAnalysisResult = {
          recognizedText: data.recognizedText,
          pronunciationScore: data.pronunciationScore,
          feedbackMessage: data.feedbackMessage,
          improvementTip: data.improvementTip || '',
          mispronounced: data.mispronounced || [],
          isSentence,
          wordAnalysis,
          skippedWords,
          incorrectWords,
          needsWordDrill,
        };

        setAnalyzeResult(result);
        return result;
      } catch (err: any) {
        console.error(`Analysis attempt failed:`, err.message);
        // If it's a timeout or server error, retry once
        // Increased the scope of retryable errors to include "timeout" and "500"
        const isRetryable = err.message?.toLowerCase().includes('timeout') || 
                           err.message?.includes('500') || 
                           err.message?.toLowerCase().includes('network') ||
                           err.message?.toLowerCase().includes('abort');

        if (!isRetry && isRetryable) {
          console.warn('Server may be asleep or busy, retrying in 3s...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          return tryAnalysis(true);
        }
        throw err;
      }
    };

    try {
      const MAX_WAIT_MS = 6000; // 6 seconds

      // If we have a local transcript, we can race the server against a fast timeout.
      // If the server takes >6s (likely waking up), we abort the UI wait and use the local result.
      if (localTranscript && localTranscript.trim().length > 0) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('UI_TIMEOUT')), MAX_WAIT_MS);
        });
        
        return await Promise.race([tryAnalysis(false), timeoutPromise]);
      } else {
        // If we have no fallback, we must wait for the server, however long it takes.
        return await tryAnalysis(false);
      }
    } catch (err: any) {
      // If it's our deliberate UI_TIMEOUT, or any other server error, use the fallback.
      if (localTranscript && localTranscript.trim().length > 0) {
        console.log(
          err.message === 'UI_TIMEOUT' 
            ? 'Server taking >6s, forcing fast local fallback.'
            : 'Using local transcript fallback due to server error.'
        );
        
        const wordCount = expectedText.split(/\s+/).filter(Boolean).length;
        const analysis = analyzeWords(expectedText, localTranscript);
        const localScore = Math.round((analysis.correctCount / wordCount) * 100);
        
        const fallbackResult: SpeechAnalysisResult = {
          recognizedText: localTranscript,
          pronunciationScore: localScore,
          feedbackMessage: localScore >= 80 ? "Great pronunciation!" : "Good effort! Try to speak a bit clearer.",
          improvementTip: "Focus on pronouncing every word clearly.",
          mispronounced: analysis.incorrectWords,
          isSentence: wordCount > 2,
          wordAnalysis: analysis.wordAnalysis,
          skippedWords: analysis.skippedWords,
          incorrectWords: analysis.incorrectWords,
          needsWordDrill: localScore < 60,
        };
        
        setAnalyzeResult(fallbackResult);
        return fallbackResult;
      }
      
      const friendlyError = err.message?.includes('Timeout') || err.message === 'UI_TIMEOUT'
        ? 'The analysis server is taking too long to wake up. Please try again in a moment.' 
        : (err.message || 'Failed to analyze speech');
      
      setError(friendlyError);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAnalysis = () => {
    setAnalyzeResult(null);
    setError(null);
    setIsAnalyzing(false);
  };

  return {
    isAnalyzing,
    analyzeResult,
    error,
    analyzeSpeech,
    resetAnalysis,
  };
};
