// Gemini API client via OpenRouter
// Handles image generation requests using Nano Banana models

// Image generation models
export const IMAGE_MODELS = {
  standard: 'google/gemini-2.5-flash-image', // $0.30/M input, $2.50/M output - cost effective
  pro: 'google/gemini-3-pro-image-preview',   // $2/M input, $12/M output - higher quality
} as const;

export type ImageQuality = 'standard' | 'pro';

export interface GenerationConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  quality?: ImageQuality;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageUrl?: string;
  imageBase64?: string;
  error?: string;
  textResponse?: string;
}

/**
 * Generate an image using Nano Banana (Gemini Image models) via OpenRouter
 * Uses the modalities: ["image", "text"] approach
 */
export async function generateImage(
  request: ImageGenerationRequest,
  apiKey: string
): Promise<ImageGenerationResponse> {
  const model = request.quality === 'pro' ? IMAGE_MODELS.pro : IMAGE_MODELS.standard;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Pogicity Asset Generator'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ],
        // Request image output from the model
        modalities: ['image', 'text']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return {
        success: false,
        error: `API error: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Check for images in response (Nano Banana format)
    if (message?.images && message.images.length > 0) {
      const imageUrl = message.images[0].image_url?.url;

      if (imageUrl) {
        // Check if it's a base64 data URL
        if (imageUrl.startsWith('data:')) {
          const base64Match = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
          if (base64Match) {
            return {
              success: true,
              imageBase64: base64Match[1],
              imageUrl: imageUrl
            };
          }
        }
        return { success: true, imageUrl: imageUrl };
      }
    }

    // Fallback: check for content
    if (message?.content) {
      return {
        success: false,
        error: 'Model returned text instead of image',
        textResponse: message.content
      };
    }

    return {
      success: false,
      error: 'No image data in response'
    };
  } catch (error) {
    console.error('Image generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Convenience wrapper that calls generateImage
 * Kept for backwards compatibility
 */
export async function generateImageWithImagen(
  request: ImageGenerationRequest,
  apiKey: string
): Promise<ImageGenerationResponse> {
  return generateImage(request, apiKey);
}

/**
 * Check if the API key is valid by making a simple request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}
