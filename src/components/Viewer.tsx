import DeckGL from "deck.gl";
import { OrthographicView } from "deck.gl";
import { useAtomValue, useSetAtom } from "jotai"; // NEW: import useSetAtom
import * as React from "react";
import { useViewState } from "../hooks";
import { layerAtoms } from "../state";
import { fitImageToViewport, isGridLayerProps, isInterleaved, resolveLoaderFromLayerProps } from "../utils";

// NEW: Import everything we need for the ROI layer
import { EditableGeoJsonLayer } from '@deck.gl-community/editable-layers';
import { ViewMode } from '@deck.gl-community/editable-layers'; // Default mode
import { editModeAtom, modeMap, roiCollectionAtom, updateRoiAtom } from '../roi-state';
import type { Feature, Geometry, FeatureCollection } from 'geojson';
import type { DeckGLRef, OrthographicViewState } from "deck.gl";
import type { VizarrLayer } from "../state";


export default function Viewer() {
  const deckRef = React.useRef<DeckGLRef>(null);
  const [viewState, setViewState] = useViewState();

  // Get the existing image layers from state.ts
  const imageLayers = useAtomValue(layerAtoms);

  // NEW: Get all the state and setters needed for the ROI layer from roi-state.ts
  const editMode = useAtomValue(editModeAtom);
  const roiCollection = useAtomValue(roiCollectionAtom);
  const setRoiUpdate = useSetAtom(updateRoiAtom);

  // NEW: Create the EditableGeoJsonLayer instance using React.useMemo
  // This ensures the layer is only recreated when its data or the mode changes.

  const roiLayer = React.useMemo(() => {
    return new EditableGeoJsonLayer({
      id: 'roi-layer',
      data: roiCollection as any,
      mode: modeMap[editMode] || ViewMode,
      selectedFeatureIndexes: [],
      onEdit: setRoiUpdate,

      // Styling for the polygons/lines themselves
      getFillColor: [255, 0, 0, 0],
      getLineColor: [255, 0, 0, 200],
      getTentativeFillColor: [255, 0, 0, 0],
      getTentativeLineColor: [255, 0, 0, 100],

      // The text-related props have been REMOVED from here.

      // Pass props to internal sub-layers
      _subLayerProps: {
        // Styling for the editing guides (dots and lines)
        guides: {
          getFillColor: [0, 255, 0, 0],
          getLineColor: [0, 255, 0, 200],
        },
        // NEW: Pass props to the internal TextLayer to render the labels
        text: {
          getText: (f: Feature<Geometry, { [key: string]: any }>) => f.properties?.text,
          // Use the correct TextLayer prop names: 'getColor' and 'getSize'
          getColor: [0, 0, 0, 200], // Black text
          getSize: 15,
        }
      },
    });
  }, [roiCollection, editMode, setRoiUpdate]);


  // If viewState hasn't been updated, use the first loader to guess viewState
  const firstLayer = imageLayers[0];
  if (deckRef.current?.deck && !viewState && firstLayer) {
    const { deck } = deckRef.current;
    setViewState(
      fitImageToViewport({
        image: getLayerSize(firstLayer),
        viewport: deck,
        padding: deck.width < 400 ? 10 : deck.width < 600 ? 30 : 50,
        matrix: firstLayer.props.modelMatrix,
      }),
    );
  }

  // NEW: Combine the image layers and our new ROI layer into one array
  const allLayers = [...imageLayers, roiLayer];

  return (
    <DeckGL
      ref={deckRef}
      layers={allLayers} // Pass the combined array to DeckGL
      viewState={viewState && { ortho: viewState }}
      onViewStateChange={(e: { viewState: OrthographicViewState }) =>
        // @ts-expect-error - deck doesn't know this should be ok
        setViewState(e.viewState)
      }
      views={[new OrthographicView({ id: "ortho", controller: true })]}
      // this would be for screenshots
      // parameters={{ preserveDrawingBuffer: true }}
    />
  );
}

function getLayerSize({ props }: VizarrLayer) {
  const loader = resolveLoaderFromLayerProps(props);
  const [baseResolution, maxZoom] = Array.isArray(loader) ? [loader[0], loader.length] : [loader, 0];
  const interleaved = isInterleaved(baseResolution.shape);
  let [height, width] = baseResolution.shape.slice(interleaved ? -3 : -2);
  if (isGridLayerProps(props)) {
    const spacer = 5;
    height = (height + spacer) * props.rows;
    width = (width + spacer) * props.columns;
  }
  return { height, width, maxZoom };
}