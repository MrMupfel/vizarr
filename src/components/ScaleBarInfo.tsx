// src/components/ScaleBarInfo.tsx
import { useAtomValue } from "jotai";
import * as React from "react";
import { sourceInfoAtom, viewStateAtom } from "../state";

// Component to render the scale bar.
export default function ScaleBarInfo() {
    const sources = useAtomValue(sourceInfoAtom);
    const viewState = useAtomValue(viewStateAtom);

    // State to hold the calculated properties of the scale bar.
    const [scaleBar, setScaleBar] = React.useState<{ width: number; text: string } | null>(null);

    React.useEffect(() => {
        if (!viewState || sources.length === 0) {
            setScaleBar(null);
            return;
        }

        const sourceData = sources[0];
        const baseLoader = sourceData.loader[0];
        if (!baseLoader.omeMeta) return;

        const multiscale = baseLoader.omeMeta[0];
        const baseResolution = multiscale.datasets[0];
        const scaleTransform = baseResolution.coordinateTransformations?.find(
            (t) => t.type === 'scale'
        );

        if (scaleTransform?.type !== 'scale') return;

        const { axes } = multiscale;
        const normalizedAxes = (axes as (Ome.Axis | string)[]).map(axis =>
            typeof axis === 'string' ? { name: axis } : axis
        );
        const xIndex = normalizedAxes.findIndex((axis) => axis.name.toLowerCase() === 'x');
        const spaceAxis = normalizedAxes.find(axis => (axis as Ome.Axis).type === 'space' && 'unit' in axis) as Ome.Axis & { unit: string } | undefined;

        if (xIndex === -1) return;

        const basePixelSizeX = scaleTransform.scale[xIndex];
        const inputUnit = spaceAxis?.unit.toLowerCase() ?? 'pixels';

        // 1. NORMALIZE the base size to nanometers.
        // We'll assume the input unit is angstrom for this conversion.
        let baseSizeInNm = basePixelSizeX;
        if (inputUnit === 'angstrom') {
            baseSizeInNm = basePixelSizeX / 10; // 10 Angstroms = 1 Nanometer
        } else if (inputUnit === 'micrometer' || inputUnit === 'micron') {
            baseSizeInNm = basePixelSizeX * 1000;
        }

        // The current size of a screen pixel, now in nanometers.
        const currentPixelSizeInNm = baseSizeInNm * Math.pow(2, -viewState.zoom);

        const TARGET_BAR_WIDTH_PX = 150;
        const roughLengthInNm = TARGET_BAR_WIDTH_PX * currentPixelSizeInNm;

        // 2. CALCULATE the "nice number" length (the result is in nanometers).
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

        // 3. SELECT the best display unit and text label.
        let display_text = '';
        // If the length is less than 1000nm, display in nm.
        if (niceLengthInNm < 1000) {
            display_text = `${niceLengthInNm.toFixed(0)} nm`;
        }
        // Otherwise, convert to micrometers (µm).
        else {
            const lengthInMicrons = niceLengthInNm / 1000;
            // Use one decimal place for microns for better precision on smaller values (e.g., 1.5 µm).
            display_text = `${lengthInMicrons.toFixed(1)} µm`;
        }

        const finalBarWidth = niceLengthInNm / currentPixelSizeInNm;

        setScaleBar({
            width: finalBarWidth,
            text: display_text,
        });

    }, [viewState, sources]);

    // If we haven't calculated a bar yet, render nothing.
    if (!scaleBar) {
        return null;
    }

    // Render the visual elements for the scale bar.
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
                pointerEvents: 'none', // Make sure it doesn't block mouse events
            }}
        >
            <div
                style={{
                    height: '4px',
                    width: `${scaleBar.width}px`,
                    backgroundColor: 'white',
                    border: '1px solid black',
                    boxSizing: 'content-box', // Ensure border doesn't add to the width
                }}
            />
            <div style={{ marginTop: '4px' }}>{scaleBar.text}</div>
        </div>
    );
}
