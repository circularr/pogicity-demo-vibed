import { NextRequest, NextResponse } from 'next/server';

// Available image generation models with pricing info
export const IMAGE_MODELS = {
    'gemini-flash': {
        id: 'google/gemini-2.5-flash-image-preview',
        name: 'Gemini Flash (Fast)',
        inputCost: 0.30,
        outputCost: 2.50,
    },
    'seedream': {
        id: 'bytedance-seed/seedream-4.5',
        name: 'Seedream 4.5',
        inputCost: 0,
        outputCost: 9.58,
    },
    'gpt5-mini': {
        id: 'openai/gpt-5-image-mini',
        name: 'GPT-5 Image Mini',
        inputCost: 2.50,
        outputCost: 2.00,
    },
    'gemini-pro': {
        id: 'google/gemini-3-pro-image-preview',
        name: 'Gemini Pro (Best)',
        inputCost: 2.00,
        outputCost: 12.00,
    },
} as const;

export type ModelKey = keyof typeof IMAGE_MODELS;

export async function POST(request: NextRequest) {
    try {
        const { prompt, apiKey, referenceImageBase64, model = 'gemini-flash' } = await request.json();

        if (!prompt) {
            return NextResponse.json(
                { error: 'Missing prompt' },
                { status: 400 }
            );
        }

        const key = apiKey || process.env.OPENROUTER_API_KEY;
        if (!key) {
            return NextResponse.json(
                { error: 'API key not configured' },
                { status: 500 }
            );
        }

        // Get model ID from key
        const modelConfig = IMAGE_MODELS[model as ModelKey] || IMAGE_MODELS['gemini-flash'];
        const modelId = modelConfig.id;

        // Build message content - support multimodal with reference image
        let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

        if (referenceImageBase64) {
            messageContent = [
                {
                    type: 'image_url',
                    image_url: {
                        url: referenceImageBase64.startsWith('data:')
                            ? referenceImageBase64
                            : `data:image/png;base64,${referenceImageBase64}`
                    }
                },
                {
                    type: 'text',
                    text: prompt
                }
            ];
        } else {
            messageContent = prompt;
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'Pogicity Asset Generator'
            },
            body: JSON.stringify({
                model: modelId,
                messages: [
                    {
                        role: 'user',
                        content: messageContent
                    }
                ],
                modalities: ['image', 'text']
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', errorText);
            return NextResponse.json(
                { error: `API error: ${response.status} - ${errorText}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message;

        if (message?.images && message.images.length > 0) {
            const imageUrl = message.images[0].image_url?.url;

            if (imageUrl) {
                if (imageUrl.startsWith('data:')) {
                    const base64Match = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
                    if (base64Match) {
                        return NextResponse.json({
                            success: true,
                            imageBase64: base64Match[1],
                            imageUrl: imageUrl
                        });
                    }
                }

                return NextResponse.json({
                    success: true,
                    imageUrl: imageUrl
                });
            }
        }

        if (message?.content) {
            return NextResponse.json({
                success: false,
                error: 'Model returned text instead of image. Try a different prompt.',
                textResponse: message.content
            });
        }

        return NextResponse.json(
            { error: 'No image data in response', rawResponse: data },
            { status: 500 }
        );
    } catch (error) {
        console.error('Generate error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
