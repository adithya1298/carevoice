import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to ping the backend server when the user enters the dashboard.
 * This wakes up the server (if it's on a free tier like Render) 
 * so it's ready by the time the user starts a therapy session.
 */
export const useServerWarmer = () => {
  useEffect(() => {
    const warmServer = async () => {
      console.log('Warming up therapy server...');
      try {
        // Send a dummy request to the analyze-speech function
        // which will in turn ping the external backend.
        const formData = new FormData();
        formData.append('ping', 'true');
        
        await supabase.functions.invoke('analyze-speech', {
          body: formData,
        });
        console.log('Server warming request sent.');
      } catch (e) {
        // We don't care if it fails, the goal is just to trigger the wake-up
        console.log('Server warming ping sent (expected response ignored).');
      }
    };

    warmServer();
  }, []);
};
