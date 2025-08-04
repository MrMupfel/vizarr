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
import { IconLayer, TextLayer } from '@deck.gl/layers';
import { editModeAtom, modeMap, roiCollectionAtom, updateRoiAtom, selectedRoiIndexAtom, deleteSelectedRoiAtom, } from '../roi-state';
import type { Feature, Geometry, FeatureCollection } from 'geojson';
import type { DeckGLRef, OrthographicViewState } from "deck.gl";
import type { VizarrLayer } from "../state";
import { COORDINATE_SYSTEM } from '@deck.gl/core'
import { isTextVisibleAtom, isRoiVisibleAtom } from "../roi-state";

// NEW: An SVG string for our delete icon.
const DELETE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ff0000ff" stroke-width="2" stroke-linejoin="round" width="24px" height="24px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>`;
// NEW: A data URL for the icon to be used in the IconLayer.
const DELETE_ICON_URL = `data:image/svg+xml;base64,${btoa(DELETE_ICON_SVG)}`;

// NEW: A helper function to get the bounding box of a feature's geometry.
function getFeatureBounds(feature: Feature): [number, number, number, number] | null {
  if (!feature || !feature.geometry) return null;

  // This handles simple Polygons (like rectangles) and MultiPolygons.
  const coords = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates.flat(1)
    : feature.geometry.type === 'MultiPolygon'
      ? feature.geometry.coordinates.flat(2)
      : null;

  if (!coords || coords.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return [minX, minY, maxX, maxY];
}

export default function Viewer() {
  const deckRef = React.useRef<DeckGLRef>(null);
  const [viewState, setViewState] = useViewState();
  const isTextVisible = useAtomValue(isTextVisibleAtom);
  const isRoiVisible = useAtomValue(isRoiVisibleAtom);


  // Get the existing image layers from state.ts
  const imageLayers = useAtomValue(layerAtoms);

  // NEW: Get all the state and setters needed for the ROI layer from roi-state.ts
  const editMode = useAtomValue(editModeAtom);
  const roiCollection = useAtomValue(roiCollectionAtom);
  const setRoiUpdate = useSetAtom(updateRoiAtom);
  const selectedIndex = useAtomValue(selectedRoiIndexAtom);
  const setSelectedIndex = useSetAtom(selectedRoiIndexAtom);
  const deleteRoi = useSetAtom(deleteSelectedRoiAtom); 

  const roiTextLayer = React.useMemo(() => {
    return new TextLayer({
      id: 'roi-text-layer',
      visible: isTextVisible,
      data: roiCollection.features,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,

      getPosition: (f: Feature) => {
        const bounds = getFeatureBounds(f);
        return bounds ? [(bounds[0] + bounds[2]) / 2, bounds[3], 0] : [0, 0, 0];
      },

      getText: (f: Feature) => f.properties?.text,

      getColor: [0, 0, 0, 255],
      sizeUnits: 'pixels',
      getSize: 16,
      sizeMinPixels: 16,
      backgroundColor: [255, 255, 255, 100],
      fontFamily: 'sans-serif',
      textAlign: 'middle',
      getAlignmentBaseline: 'top',
      getPixelOffset: [0, 10],
    });
  }, [roiCollection, isTextVisible]);

  // NEW: Create the EditableGeoJsonLayer instance using React.useMemo
  // This ensures the layer is only recreated when its data or the mode changes.

  const roiLayer = React.useMemo(() => {
    return new EditableGeoJsonLayer({
      id: 'roi-layer',
      visible: isRoiVisible,
      data: roiCollection as any,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      mode: modeMap[editMode] || ViewMode,
      onEdit: setRoiUpdate,

      // Update the layer props
      selectedFeatureIndexes: selectedIndex !== null ? [selectedIndex] : [],

      onClick: (info, event) => {
        // Deselect if clicking on empty space in modify mode
        if (info.index === -1 && editMode === 'modify') {
          setSelectedIndex(null);
        } else {
          setSelectedIndex(info.index);
        }
      },

      // Use a function to change color based on selection state
      getFillColor: (feature: Feature, isSelected: boolean) =>
        isSelected ? [255, 164, 61, 50] : [255, 0, 0, 0], // Orange highlight, otherwise red
      getLineColor: (feature: Feature, isSelected: boolean) =>
        isSelected ? [255, 164, 61, 255] : [255, 0, 0, 200], // Orange highlight, otherwise red

      getTentativeFillColor: [255, 0, 0, 0],
      getTentativeLineColor: [255, 0, 0, 100],

      _subLayerProps: {
        guides: {
          getFillColor: [0, 255, 0, 50],
          getLineColor: [0, 255, 0, 200],
        },
      },
    });
  }, [
    roiCollection,
    editMode,
    setRoiUpdate,
    selectedIndex,
    setSelectedIndex,
    isRoiVisible,
  ]);

  // NEW: Create the IconLayer for the delete button.
  const deleteIconLayer = React.useMemo(() => {
    // If nothing is selected, don't render this layer
    if (selectedIndex === null) {
      return null;
    }

    const selectedFeature = roiCollection.features[selectedIndex];
    if (!selectedFeature) {
      return null;
    }

    const bounds = getFeatureBounds(selectedFeature);
    if (!bounds) {
      return null;
    }

    const [minX, minY, maxX, maxY] = bounds;

    // The data for our layer is a single point: the top-right corner of the shape.
    const iconData = [{
      position: [maxX, minY], // Position at top-right corner
      icon: 'delete',
    }];

    return new IconLayer({
      id: 'delete-icon-layer',
      data: iconData,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      pickable: true,
      onClick: () => {
        // When clicked, call the delete function from our state
        deleteRoi();
      },
      iconAtlas: DELETE_ICON_URL,
      iconMapping: {
        delete: { x: 0, y: 0, width: 24, height: 24, mask: false }
      },
      getIcon: d => d.icon,
      getPosition: d => d.position,
      getSize: 24,
      // Offset the icon slightly to sit outside the corner of the shape
      getPixelOffset: [18, -18],
    });
  }, [selectedIndex, roiCollection, deleteRoi]);


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
  const allLayers = [...imageLayers, roiLayer, deleteIconLayer, roiTextLayer, ].filter(Boolean);

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