import { atom } from 'jotai';
// Import the full suite of types we need from GeoJSON
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  type EditAction,
  ViewMode,
  DrawPolygonMode,
  MeasureDistanceMode,
} from '@deck.gl-community/editable-layers';

// Defines the names of the drawing modes we'll support.
export type EditMode = 'view' | 'drawPolygon' | 'measureDistance';

// A mapping from our simple string mode names to the actual Deck.gl mode classes.
// We define it here so other parts of the app can use it.
export const modeMap = {
  view: ViewMode,
  drawPolygon: DrawPolygonMode,
  measureDistance: MeasureDistanceMode,
};

// An atom to hold the string name of the currently active mode.
export const editModeAtom = atom<EditMode>('view');

// An atom to store our ROI shapes. We use a more specific FeatureCollection type
// to tell TypeScript that our features can have any Geometry and any properties.
export const roiCollectionAtom = atom<FeatureCollection<Geometry, { [key: string]: any }>>({
  type: 'FeatureCollection',
  features: [],
});

// A write-only atom that receives the entire "edit action" from the layer.
export const updateRoiAtom = atom(
  null, // This atom is write-only
  (get, set, action: EditAction<FeatureCollection<Geometry, { [key: string]: any }>>) => {
    // The type for action.updatedData is FeatureCollection.
    // We cast it to our more specific type to satisfy TypeScript.
    const updatedData = action.updatedData as FeatureCollection<Geometry, { [key: string]: any }>;

    // When a new feature is added, ask the user for a label.
    if (action.editType === 'addFeature') {
      const newFeatureIndex = updatedData.features.length - 1;
      const text = window.prompt('Enter label text:');
      const feature = updatedData.features[newFeatureIndex];
      // Ensure the properties object exists before assigning to it
      if (!feature.properties) {
        feature.properties = {};
      }
      feature.properties.text = text || ''; // Add text to the feature's properties
    }

    set(roiCollectionAtom, updatedData);
    // This is the data that should be saved to your Django backend eventually
    console.log('ROI data updated:', updatedData);
  }
);