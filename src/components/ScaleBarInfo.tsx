// src/components/ScaleBarInfo.tsx
import * as React from "react";
import { usePixelSize } from "../hooks";

// Component to render the scale bar.
export default function ScaleBarInfo() {
    // 1. Get the pixel size directly from our custom hook.
    const currentPixelSizeInNm = usePixelSize();

    // 2. Calculate the scale bar properties using React.useMemo.
    // This will only re-run when the pixel size changes.
    const scaleBar = React.useMemo(() => {
        if (!currentPixelSizeInNm) {
            return null;
        }

        const TARGET_BAR_WIDTH_PX = 150;
        const roughLengthInNm = TARGET_BAR_WIDTH_PX * currentPixelSizeInNm;

        // CALCULATE the "nice number" length (the result is in nanometers).
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughLengthInNm)));
        const residual = roughLengthInNm / magnitude;

        let niceLengthInNm;
        if (residual < 1.5) {
            niceLengthInNm = 1 * magnitude;
        } else if (residual < 3.5) {
            niceLengthInNm = 2 * magnitude;
        } else if (residual < 7.5) {
            niceLengthInNm = 5 * magnitude;
        } else {
            niceLengthInNm = 10 * magnitude;
        }

        // SELECT the best display unit and text label.
        let display_text = '';
        if (niceLengthInNm < 1) {
            display_text = `${(niceLengthInNm).toFixed(1)} nm`;
        }
        else if (niceLengthInNm < 1000) {
            display_text = `${niceLengthInNm.toFixed(0)} nm`;
        } else {
            const lengthInMicrons = niceLengthInNm / 1000;
            display_text = `${lengthInMicrons.toFixed(1)} µm`;
        }

        const finalBarWidth = niceLengthInNm / currentPixelSizeInNm;

        return {
            width: finalBarWidth,
            text: display_text,
        };

    }, [currentPixelSizeInNm]);

    // If we haven't calculated a bar yet, render nothing.
    if (!scaleBar) {
        return null;
    }

    // 3. The rendering logic remains exactly the same.
    return (
        <div
            style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                color: 'white',
                fontFamily: 'sans-serif',
                fontSize: '14px',
                textShadow: '1px 1px 2px black',
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    height: '4px',
                    width: `${scaleBar.width}px`,
                    backgroundColor: 'white',
                    border: '1px solid black',
                    boxSizing: 'content-box',
                }}
            />
            <div style={{ marginTop: '4px' }}>{scaleBar.text}</div>
        </div>
    );
}
