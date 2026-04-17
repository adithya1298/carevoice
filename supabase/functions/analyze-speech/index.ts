import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTERNAL_API_URL = 'https://carevoice-backend.onrender.com/analyze-speech';

interface ExternalApiResponse {
  recognizedText: string;
  pronunciationScore: number;
  feedbackMessage: string;
  improvementTip: string;
  mispronounced?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Received speech analysis request');
    
    // Check content type
    const contentType = req.headers.get('content-type') || '';
    
    let audioFile: File | null = null;
    let expectedText: string | null = null;
    let isPing = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      audioFile = formData.get('audio') as File;
      expectedText = formData.get('expectedText') as string;
      isPing = formData.get('ping') === 'true';
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      isPing = body.ping === true || body.ping === 'true';
      expectedText = body.expectedText;
    }

    if (isPing) {
      console.log('Ping request received, warming up external API...');
      // Just ping the external API and return early
      fetch(EXTERNAL_API_URL, { method: 'HEAD' }).catch(e => console.error('Ping fetch failed:', e));
      return new Response(
        JSON.stringify({ status: 'warming', message: 'Server warming initiated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!audioFile) {
      console.error('No audio file provided');
      return new Response(
        JSON.stringify({ error: 'No audio file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!expectedText) {
      console.error('No expected text provided');
      return new Response(
        JSON.stringify({ error: 'No expected text provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing audio file: ${audioFile.name || 'blob'}, size: ${audioFile.size} bytes`);
    console.log(`Expected text: "${expectedText}"`);

    // Create FormData to send to external API
    const externalFormData = new FormData();
    externalFormData.append('file', audioFile, audioFile.name || 'recording.webm');
    externalFormData.append('expected_text', expectedText);

    console.log(`Calling external API: ${EXTERNAL_API_URL}`);

    // Create a controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for cold starts

    let externalResponse: Response | null = null;
    let attempt = 0;
    const maxAttempts = 2; // Try once, retry once

    try {
      while (attempt < maxAttempts) {
        attempt++;
        console.log(`External API attempt ${attempt}/${maxAttempts}...`);
        
        try {
          const currentFormData = attempt === 1 ? externalFormData : (() => {
            const fd = new FormData();
            fd.append('file', audioFile as File, (audioFile as File).name || 'recording.webm');
            fd.append('expected_text', expectedText as string);
            return fd;
          })();

          externalResponse = await fetch(EXTERNAL_API_URL, {
            method: 'POST',
            body: currentFormData,
            signal: controller.signal,
          });

          if (externalResponse.ok) {
            break; // Success!
          }
          
          const errorText = await externalResponse.text();
          console.error(`External API error (Attempt ${attempt}): ${externalResponse.status} - ${errorText}`);
          
          if (externalResponse.status >= 500 && attempt < maxAttempts) {
            console.log(`Waiting 2 seconds before retry...`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          } else {
            throw new Error(`External API returned ${externalResponse.status}: ${errorText}`);
          }
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            throw fetchError; // Rethrow to outer catch block to handle timeout
          }
          
          if (attempt < maxAttempts) {
             console.error(`Fetch error (Attempt ${attempt}):`, fetchError.message);
             await new Promise(r => setTimeout(r, 2000));
             continue;
          }
          throw fetchError;
        }
      }

      clearTimeout(timeoutId);

      if (!externalResponse || !externalResponse.ok) {
        throw new Error('Failed to reach external API after multiple attempts.');
      }

      const externalData: ExternalApiResponse = await externalResponse.json();
      console.log('External API response received successfully');

      // Format response for frontend
      const result = {
        recognizedText: externalData.recognizedText || '',
        pronunciationScore: externalData.pronunciationScore || 0,
        feedbackMessage: externalData.feedbackMessage || '',
        improvementTip: externalData.improvementTip || '',
        mispronounced: externalData.mispronounced || [],
      };

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Timeout: External API took too long to respond (possibly warming up)');
      }
      throw fetchError;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing speech analysis:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'Failed to analyze speech', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
