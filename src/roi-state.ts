import { atom, type Getter } from 'jotai';
import debounce from 'just-debounce-it';
// Import the full suite of types we need from GeoJSON
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  type EditAction,
  ViewMode,
  DrawPolygonMode,
  DrawRectangleMode,
  ModifyMode,
} from '@deck.gl-community/editable-layers';
import type { junit } from 'node:test/reporters';

// Defines the names of the drawing modes we'll support.
export type EditMode = 'view' | 'drawPolygon' | 'drawRectangle' | 'modify' | 'measureDistance';

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


// debounced saving
const saveFunction = (get: Getter) => {
  const dataToSave = get(roiCollectionAtom);
  console.log('Data send:', dataToSave);

  //saving logic
  fetch('/api/rois/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dataToSave),
  })
    .then(response => {
      if (!response.ok) {
        console.error('Failed to save ROIs', response.statusText);
      } else {
        console.log('ROIs saved successfully!');
      }
    })
    .catch(error => {
      console.error('Network error while saving ROIs:', error);
    });
};
const debouncedSave = debounce(saveFunction, 1000);

const debouncedSaveRoisAtom = atom(
  null, // Write-only
  (get, set) => {
    debouncedSave(get);
  }
);


// A write-only atom that receives the entire "edit action" from the layer.
export const updateRoiAtom = atom(
  null, // This atom is write-only
  (get, set, action: EditAction<FeatureCollection<Geometry, { [key: string]: any }>>) => {
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
    set(debouncedSaveRoisAtom);
  }
);

// // write-only atom for deleting the currently selected ROI.
// export const deleteSelectedRoiAtom = atom(
//   null, // This atom is write-only
//   (get, set) => {
//     const selectedIndex = get(selectedRoiIndexAtom);

//     // Only proceed if there is a selected ROI
//     if (selectedIndex !== null) {
//       const currentCollection = get(roiCollectionAtom);

//       // Create a new features array excluding the one at selectedIndex
//       const updatedFeatures = currentCollection.features.filter(
//         (_, index) => index !== selectedIndex
//       );

//       // Update the main ROI collection with the new features
//       set(roiCollectionAtom, {
//         ...currentCollection,
//         features: updatedFeatures,
//       });

//       // Important: Reset the selection since the ROI is now gone
//       set(selectedRoiIndexAtom, null);

//       console.log(`ROI at index ${selectedIndex} deleted.`);
//     }
//   }
// );

export const deleteSelectedRoiAtom = atom(
  null, // Write-only
  async (get, set) => { 
    const selectedIndex = get(selectedRoiIndexAtom);
    const currentCollection = get(roiCollectionAtom);

    // 1. Check if an ROI is actually selected
    if (selectedIndex === null) {
      console.log('No ROI selected to delete.');
      return;
    }

    const featureToDelete = currentCollection.features[selectedIndex];
    const roiId = featureToDelete?.properties?.id;

    // 2. Check if the ROI has a database ID. (A newly drawn ROI might not have one yet).
    if (!roiId) {
      console.error("This ROI doesn't have a database ID and can't be deleted from the server.");
      // For now, we'll just remove it from the frontend if it's a new, unsaved shape.
      // A more robust solution might prevent deleting unsaved shapes.
    } else {
      // 3. This is an existing ROI with an ID, so we call the backend
      try {
        const response = await fetch(`/api/rois/${roiId}/`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          // If the server failed to delete it, throw an error
          throw new Error('Failed to delete ROI on server.');
        }

        console.log(`ROI with ID ${roiId} deleted from server.`);

      } catch (error) {
        console.error(error);
        // If the API call fails, we stop here and don't update the UI.
        return;
      }
    }

    // 4. If the API call was successful (or if it was an unsaved shape),
    //    update the frontend state.
    const updatedFeatures = currentCollection.features.filter(
      (_, index) => index !== selectedIndex
    );

    set(roiCollectionAtom, {
      ...currentCollection,
      features: updatedFeatures,
    });
    
    // Reset the selection
    set(selectedRoiIndexAtom, null);
  }
);

// An atom to control the visibility of the ROI text labels.
export const isTextVisibleAtom = atom(true);

export const isRoiVisibleAtom = atom(true);