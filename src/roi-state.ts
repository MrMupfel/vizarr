import { atom } from 'jotai';
// Import the full suite of types we need from GeoJSON
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  type EditAction,
  ViewMode,
  DrawPolygonMode,
  DrawRectangleMode,
  ModifyMode,
} from '@deck.gl-community/editable-layers';

// Defines the names of the drawing modes we'll support.
export type EditMode = 'view' | 'drawPolygon' | 'drawRectangle' | 'modify';

// A mapping from our simple string mode names to the actual Deck.gl mode classes.
// We define it here so other parts of the app can use it.
export const modeMap = {
  view: ViewMode,
  drawPolygon: DrawPolygonMode,
  drawRectangle: DrawRectangleMode,
  modify: ModifyMode,
};

// An atom to hold the string name of the currently active mode.
// This "private" atom holds the actual state value.
const baseEditModeAtom = atom<EditMode>('view');

// This is the public atom that components will interact with.
export const editModeAtom = atom(
  // The "read" function is simple: it just gets the value from our base atom.
  (get) => get(baseEditModeAtom),
  // The "write" function is now more powerful.
  (get, set, newMode: EditMode) => {
    // 1. It updates the mode as expected.
    set(baseEditModeAtom, newMode);
    // 2. It ALSO performs the side-effect of clearing any selection.
    set(selectedRoiIndexAtom, null);
  }
);

// The atom to track the selected ROI
export const selectedRoiIndexAtom = atom<number | null>(null);

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

// write-only atom for deleting the currently selected ROI.
export const deleteSelectedRoiAtom = atom(
  null, // This atom is write-only
  (get, set) => {
    const selectedIndex = get(selectedRoiIndexAtom);
    
    // Only proceed if there is a selected ROI
    if (selectedIndex !== null) {
      const currentCollection = get(roiCollectionAtom);
      
      // Create a new features array excluding the one at selectedIndex
      const updatedFeatures = currentCollection.features.filter(
        (_, index) => index !== selectedIndex
      );

      // Update the main ROI collection with the new features
      set(roiCollectionAtom, {
        ...currentCollection,
        features: updatedFeatures,
      });
      
      // Important: Reset the selection since the ROI is now gone
      set(selectedRoiIndexAtom, null);

      console.log(`ROI at index ${selectedIndex} deleted.`);
    }
  }
);

// An atom to control the visibility of the ROI text labels.
export const isTextVisibleAtom = atom(true);

export const isRoiVisibleAtom = atom(true);