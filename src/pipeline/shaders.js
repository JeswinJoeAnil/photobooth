/**
 * WebGL2 Shaders for Virtual Background Engine
 * Contains Vertex Shader, Separable Gaussian Blur Shaders, and the
 * Master Compositor Shader with Joint Bilateral Upsample, Temporal EMA,
 * Color Decontamination, and Light-Based Edge Feathering.
 */

export const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}`;

// Separable Gaussian Blur Horizontal Pass Shader
export const BLUR_H_FRAG_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_blurRadius;
uniform vec2 u_texelSize;

in vec2 v_texCoord;
out vec4 outColor;

void main() {
    if (u_blurRadius <= 0.1) {
        outColor = texture(u_image, v_texCoord);
        return;
    }
    
    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;
    
    // 9-tap Gaussian distribution
    float weights[9] = float[](0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05);
    float offsets[9] = float[](-4.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0);
    
    for (int i = 0; i < 9; i++) {
        vec2 sampleUv = v_texCoord + vec2(offsets[i] * u_texelSize.x * u_blurRadius * 0.4, 0.0);
        float w = weights[i];
        sum += texture(u_image, sampleUv) * w;
        totalWeight += w;
    }
    
    outColor = sum / totalWeight;
}`;

// Separable Gaussian Blur Vertical Pass Shader
export const BLUR_V_FRAG_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_blurRadius;
uniform vec2 u_texelSize;

in vec2 v_texCoord;
out vec4 outColor;

void main() {
    if (u_blurRadius <= 0.1) {
        outColor = texture(u_image, v_texCoord);
        return;
    }
    
    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;
    
    float weights[9] = float[](0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05);
    float offsets[9] = float[](-4.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0);
    
    for (int i = 0; i < 9; i++) {
        vec2 sampleUv = v_texCoord + vec2(0.0, offsets[i] * u_texelSize.y * u_blurRadius * 0.4);
        float w = weights[i];
        sum += texture(u_image, sampleUv) * w;
        totalWeight += w;
    }
    
    outColor = sum / totalWeight;
}`;

// Master Compositor Shader with Joint Bilateral Upsample, Temporal Feedback, & Color Decontamination
export const COMPOSITOR_FRAG_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_frame;          // Full-res webcam texture
uniform sampler2D u_mask;           // Low-res confidence mask texture
uniform sampler2D u_prevMask;       // Previous frame's smoothed mask texture for GPU temporal filter
uniform sampler2D u_background;     // Background image or blurred background texture
uniform vec4 u_solidColor;          // Solid background color (or clear alpha for transparent export)

uniform int u_bgMode;               // 0: Image/Blur, 1: Solid Color, 2: Transparent
uniform float u_temporalAlpha;      // Base EMA responsiveness factor (0.05 - 0.5)
uniform float u_edgeFeather;        // Feather threshold width (0.005 - 0.08)
uniform float u_decontamAmount;     // Color decontamination intensity (0.0 - 1.0)
uniform vec2 u_texelSize;           // 1.0 / full_res (dx, dy)
uniform vec2 u_maskTexelSize;       // 1.0 / low_res_mask (dx, dy)
uniform float u_mirror;             // 1.0 = mirrored horizontally, 0.0 = normal

in vec2 v_texCoord;
out vec4 outColor;

// Calculates perceptual luminance of an RGB pixel
float getLuma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// 1. Joint Bilateral Upsampling
// Upscales the low-res alpha mask using high-res frame luminance as guidance.
// This prevents blurry edges around hair and glasses by snapping mask boundaries to high-res luminance gradients.
float sampleJointBilateralMask(vec2 uv) {
    vec3 centerColor = texture(u_frame, uv).rgb;
    float centerLuma = getLuma(centerColor);
    
    float totalMask = 0.0;
    float totalWeight = 0.0;
    
    // 3x3 neighborhood kernel sampling in low-res mask space
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offsetUv = uv + vec2(float(x) * u_maskTexelSize.x, float(y) * u_maskTexelSize.y);
            float maskVal = texture(u_mask, offsetUv).r;
            
            // Spatial distance weight
            float spatialDist = float(x * x + y * y);
            float spatialWeight = exp(-spatialDist / 2.0);
            
            // Luminance range weight (compares neighbor high-res luminance with center luminance)
            vec3 neighborColor = texture(u_frame, offsetUv).rgb;
            float neighborLuma = getLuma(neighborColor);
            float lumaDiff = abs(centerLuma - neighborLuma);
            float rangeWeight = exp(-lumaDiff * lumaDiff / (2.0 * 0.04));
            
            float weight = spatialWeight * rangeWeight;
            totalMask += maskVal * weight;
            totalWeight += weight;
        }
    }
    
    return totalWeight > 0.0001 ? (totalMask / totalWeight) : texture(u_mask, uv).r;
}

// 2. Color Decontamination
// Near boundary regions, original camera pixels contain bleed/spill from old background.
// We sample inward toward high-confidence foreground (alpha > 0.85) along radial search to recover true foreground color.
vec3 decontaminateForeground(vec2 uv, vec3 rawFg, float alpha) {
    if (alpha > 0.92 || alpha < 0.05 || u_decontamAmount <= 0.01) {
        return rawFg;
    }
    
    // Search inward towards subject center / high alpha
    vec2 centerVector = normalize(vec2(0.5) - uv);
    vec3 inwardFgSum = vec3(0.0);
    float weightSum = 0.0;
    
    for (int i = 1; i <= 4; i++) {
        vec2 sampleUv = uv + centerVector * u_texelSize * float(i) * 2.5;
        float sampleMask = texture(u_mask, sampleUv).r;
        if (sampleMask > 0.8) {
            vec3 color = texture(u_frame, sampleUv).rgb;
            float w = sampleMask * (5.0 - float(i));
            inwardFgSum += color * w;
            weightSum += w;
        }
    }
    
    if (weightSum > 0.001) {
        vec3 estimatedFg = inwardFgSum / weightSum;
        // Blend estimated true foreground into boundary pixel
        float decontamFactor = (1.0 - alpha) * u_decontamAmount;
        return mix(rawFg, estimatedFg, clamp(decontamFactor, 0.0, 0.85));
    }
    
    return rawFg;
}

void main() {
    // Handle horizontal mirroring if enabled
    vec2 frameUv = v_texCoord;
    if (u_mirror > 0.5) {
        frameUv.x = 1.0 - frameUv.x;
    }

    // 1. Joint Bilateral Upsample low-res mask -> full-res guided mask
    float currentRawMask = sampleJointBilateralMask(frameUv);
    
    // 2. Temporal Smoothing (EMA) with Motion Magnitude Adaptation
    float prevSmoothedMask = texture(u_prevMask, frameUv).r;
    
    // Per-pixel motion detection
    float motionMagnitude = abs(currentRawMask - prevSmoothedMask);
    
    // Static regions -> low alpha (0.10-0.20) = heavy temporal smoothing (no jitter/ants)
    // Fast moving hands/head -> high alpha (0.70-0.95) = immediate response (no ghosting/lag trails)
    float dynamicAlpha = clamp(u_temporalAlpha + (motionMagnitude * 3.5), 0.08, 0.95);
    
    float temporalMask = mix(prevSmoothedMask, currentRawMask, dynamicAlpha);
    
    // 3. Edge Feathering & Falloff
    float featheredAlpha = smoothstep(0.5 - u_edgeFeather, 0.5 + u_edgeFeather, temporalMask);
    
    // Sample raw webcam frame
    vec3 rawFgColor = texture(u_frame, frameUv).rgb;
    
    // 4. Color Decontamination
    vec3 cleanFgColor = decontaminateForeground(frameUv, rawFgColor, featheredAlpha);
    
    // 5. Select Background Layer
    vec4 bgColor;
    if (u_bgMode == 3) {
        // Blurred camera background: sample with frameUv so mirrored blur stays perfectly aligned with camera feed
        bgColor = texture(u_background, frameUv);
    } else if (u_bgMode == 1) {
        // Solid Color
        bgColor = u_solidColor;
    } else if (u_bgMode == 2) {
        // Transparent
        bgColor = vec4(0.0, 0.0, 0.0, 0.0);
    } else {
        // Custom Image or Studio Scene
        bgColor = texture(u_background, v_texCoord);
    }
    
    // Final Compositing Pass
    if (u_bgMode == 2) {
        // Transparent export mode: premultiplied foreground alpha
        outColor = vec4(cleanFgColor * featheredAlpha, featheredAlpha);
    } else {
        // Opaque compositing mode
        vec3 finalRgb = mix(bgColor.rgb, cleanFgColor, featheredAlpha);
        outColor = vec4(finalRgb, 1.0);
    }
}`;

// Mask Copy Shader for Temporal Feedback Ping-Pong
export const MASK_COPY_FRAG_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_maskTex;
in vec2 v_texCoord;
out vec4 outColor;

void main() {
    float val = texture(u_maskTex, v_texCoord).r;
    outColor = vec4(val, val, val, 1.0);
}`;
