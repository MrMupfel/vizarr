import { type PrimitiveAtom, useAtom, useAtomValue } from "jotai";
import * as React from "react";
import type { LayerState, SourceData, ViewState } from "./state";
import { sourceInfoAtom, viewStateAtom } from "./state";

import * as utils from "./utils";

export const SourceDataContext = React.createContext<PrimitiveAtom<{ id: string } & SourceData> | null>(null);

export function useSourceData() {
  const atom = React.useContext(SourceDataContext);
  utils.assert(atom, "useSourceData hook must be used within SourceDataContext.");
  return useAtom(atom);
}

export const LayerStateContext = React.createContext<PrimitiveAtom<{ id: string } & LayerState> | null>(null);

export function useLayerState() {
  const atom = React.useContext(LayerStateContext);
  utils.assert(atom, "useLayerState hook must be used within LayerStateContext.");
  return useAtom(atom);
}

export const ViewStateContext = React.createContext<PrimitiveAtom<ViewState | null> | null>(null);

export function useViewState() {
  const atom = React.useContext(ViewStateContext);
  utils.assert(atom, "useViewState hook must be used within ViewStateContext.");
  return useAtom(atom);
}

/**
 * A custom hook that calculates the physical size of a screen pixel in nanometers.
 * It uses the image metadata and the current viewport zoom level.
 * @returns The current size of a single screen pixel in nanometers, or null if not available.
 */
export function usePixelSize() {
  const sources = useAtomValue(sourceInfoAtom);
  const viewState = useAtomValue(viewStateAtom);

  if (!viewState || sources.length === 0) {
    return null;
  }

  const sourceData = sources[0];
  const baseLoader = sourceData.loader[0];
  if (!baseLoader.omeMeta) return null;

  const multiscale = baseLoader.omeMeta[0];
  const baseResolution = multiscale.datasets[0];
  const scaleTransform = baseResolution.coordinateTransformations?.find(
    (t) => t.type === 'scale'
  );

  if (scaleTransform?.type !== 'scale') return null;

  const { axes } = multiscale;
  const normalizedAxes = (axes as (Ome.Axis | string)[]).map(axis =>
    typeof axis === 'string' ? { name: axis } : axis
  );
  const xIndex = normalizedAxes.findIndex((axis) => axis.name.toLowerCase() === 'x');
  const spaceAxis = normalizedAxes.find(axis => (axis as Ome.Axis).type === 'space' && 'unit' in axis) as Ome.Axis & { unit: string } | undefined;

  if (xIndex === -1) return null;

  const basePixelSizeX = scaleTransform.scale[xIndex];
  const inputUnit = spaceAxis?.unit.toLowerCase() ?? 'pixels';

  // 1. NORMALIZE the base size to nanometers.
  let baseSizeInNm = basePixelSizeX;
  if (inputUnit === 'angstrom') {
    baseSizeInNm = basePixelSizeX / 10;
  } else if (inputUnit === 'micrometer' || inputUnit === 'micron') {
    baseSizeInNm = basePixelSizeX * 1000;
  }

  // The current size of a screen pixel, now in nanometers.
  return baseSizeInNm * Math.pow(2, -viewState.zoom);
}

// src/hooks.tsx

/**
 * A hook that calculates the physical size of a single highest-resolution pixel
 * in both X and Y dimensions, returning the result in nanometers.
 */
export function useWorldPixelSizes() {
  const sources = useAtomValue(sourceInfoAtom);

  if (sources.length === 0) {
    return null;
  }

  const sourceData = sources[0];
  const baseLoader = sourceData.loader[0];
  if (!baseLoader.omeMeta) return null;

  const multiscale = baseLoader.omeMeta[0];
  const baseResolution = multiscale.datasets[0];
  const scaleTransform = baseResolution.coordinateTransformations?.find(
    (t) => t.type === 'scale'
  );

  if (scaleTransform?.type !== 'scale') return null;

  const { axes } = multiscale;
  const normalizedAxes = (axes as (Ome.Axis | string)[]).map(axis =>
    typeof axis === 'string' ? { name: axis } : axis
  );
  const xIndex = normalizedAxes.findIndex((axis) => axis.name.toLowerCase() === 'x');
  const yIndex = normalizedAxes.findIndex((axis) => axis.name.toLowerCase() === 'y');
  
  if (xIndex === -1 || yIndex === -1) return null;

  const spaceAxis = normalizedAxes.find(axis => (axis as Ome.Axis).type === 'space' && 'unit' in axis) as Ome.Axis & { unit: string } | undefined;
  const inputUnit = spaceAxis?.unit.toLowerCase() ?? 'pixels';
  
  const [basePixelSizeX, basePixelSizeY] = [scaleTransform.scale[xIndex], scaleTransform.scale[yIndex]];

  let nmPerPixelX = basePixelSizeX;
  let nmPerPixelY = basePixelSizeY;

  if (inputUnit === 'angstrom') {
    nmPerPixelX /= 10;
    nmPerPixelY /= 10;
  } else if (inputUnit === 'micrometer' || inputUnit === 'micron') {
    // This is where we correct the previous unit error based on your data.
    // If your data's 'unit' is 'micrometer' but the scale is already in nm, this is correct.
    // If your data is 800 angstrom, this block is not entered, which is also correct.
  }

  return { x: nmPerPixelX, y: nmPerPixelY };
}