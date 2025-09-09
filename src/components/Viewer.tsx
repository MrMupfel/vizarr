import DeckGL from "deck.gl";
import { OrthographicView } from "deck.gl";
import { useAtomValue, useSetAtom } from "jotai"; // NEW: import useSetAtom
import * as React from "react";
import { useViewState, useLoadRois } from "../hooks";
import { layerAtoms } from "../state";
import { fitImageToViewport, isGridLayerProps, isInterleaved, resolveLoaderFromLayerProps } from "../utils";

// NEW: Import everything we need for the ROI layer
import { EditableGeoJsonLayer, } from '@deck.gl-community/editable-layers';
import { ViewMode } from '@deck.gl-community/editable-layers'; // Default mode
import { IconLayer, TextLayer, LineLayer } from '@deck.gl/layers';
import { editModeAtom, modeMap, roiCollectionAtom, updateRoiAtom, selectedRoiIndexAtom, deleteSelectedRoiAtom, } from '../roi-state';
import type { Feature, Geometry, Position } from 'geojson';
import type { DeckGLRef, OrthographicViewState } from "deck.gl";
import type { VizarrLayer } from "../state";
import { COORDINATE_SYSTEM } from '@deck.gl/core'
import { isTextVisibleAtom, isRoiVisibleAtom } from "../roi-state";

// NEW: An SVG string for our delete icon.
const DELETE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ff0000ff" stroke-width="2" stroke-linejoin="round" width="24px" height="24px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>`;
// NEW: A data URL for the icon to be used in the IconLayer.
const DELETE_ICON_URL = `data:image/svg+xml;base64,${btoa(DELETE_ICON_SVG)}`;

type VizarrFeature = Feature<Geometry, { [key: string]: any }>;

function getWorldDistance(coordinates: Position[]): number {
  let totalLength = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];
    // The coordinates are already in nanometers, so we just find the distance.
    const dx = x2 - x1;
    const dy = y2 - y1;
    totalLength += Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
  }
  return totalLength;
}


// NEW: A helper function to get the bounding box of a feature's geometry.
function getFeatureBounds(feature: VizarrFeature): [number, number, number, number] | null {
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

  // Get all the state and setters needed for the ROI layer from roi-state.ts
  const editMode = useAtomValue(editModeAtom);
  const roiCollection = useAtomValue(roiCollectionAtom);
  const setRoiUpdate = useSetAtom(updateRoiAtom);
  const selectedIndex = useAtomValue(selectedRoiIndexAtom);
  const setSelectedIndex = useSetAtom(selectedRoiIndexAtom);
  const deleteRoi = useSetAtom(deleteSelectedRoiAtom);

  // Measurment
  const [tentativeCoords, setTentativeCoords] = React.useState<Position[]>([]);
  const [liveMeasurement, setLiveMeasurement] = React.useState<{ text: string, position: Position } | null>(null);
  const [pointerPosition, setPointerPosition] = React.useState<Position | null>(null);

  // using the hook for saving to django
  useLoadRois();

  // Define a callback function to control the cursor
  const getCursor = React.useCallback((state: { isDragging: boolean; isHovering: boolean; }) => {
    // If we're in 'view' mode, we are responsible for the hand cursor.
    if (editMode === 'view') {
      // Use 'grabbing' (closed hand) if dragging, otherwise 'grab' (open hand).
      return state.isDragging ? 'grabbing' : 'grab';
    } else if (editMode === 'measureDistance') {
      return state.isHovering ? 'crosshair' : 'crosshair';
    } else {
      return 'default';
    }
  }, [editMode]);


  // Tooltip for displaying author of roi
  const getTooltip = (info: any) => {
    // Destructure the object from the info parameter
    const { object } = info;

    // The rest of the function remains exactly the same
    if (!object || !object.properties) {
      return null;
    }

    const { author } = object.properties;

    if (!author) {
      return null;
    }

    let content = '';
    if (author) {
      content += `<em>Author:</em> ${author}`;
    }

    return {
      html: `<div style="background-color: #333; color: white; padding: 8px; border-radius: 4px; font-family: sans-serif; font-size: 12px; max-width: 400px;">${content}</div>`,
      style: {
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
      }
    };
  };


  React.useEffect(() => {
    if (editMode !== 'measureDistance') {
      // Clear all measurement state when not measuring
      setLiveMeasurement(null);
      setTentativeCoords([]);
    }
  }, [editMode]);

  const measurementLineLayer = React.useMemo(() => {
    // Don't draw anything if we haven't started
    if (tentativeCoords.length === 0) return null;

    // If we have ONE point, draw a "rubber band" line from it to the live pointer
    if (tentativeCoords.length === 1 && pointerPosition) {
      return new LineLayer({
        id: 'measurement-line-layer-live', // Use a different ID for the live version
        data: [{ sourcePosition: tentativeCoords[0], targetPosition: pointerPosition }],
        getSourcePosition: d => d.sourcePosition,
        getTargetPosition: d => d.targetPosition,
        getColor: [0, 255, 255, 100], // Make the live line slightly transparent
        getWidth: 2,
      });
    }

    // If we have TWO points, draw the final, solid line
    if (tentativeCoords.length === 2) {
      return new LineLayer({
        id: 'measurement-line-layer-final', // Use a different ID for the final version
        data: [{ sourcePosition: tentativeCoords[0], targetPosition: tentativeCoords[1] }],
        getSourcePosition: d => d.sourcePosition,
        getTargetPosition: d => d.targetPosition,
        getColor: [0, 255, 255, 255], // Solid cyan color
        getWidth: 2,
      });
    }
    return null;
  }, [tentativeCoords, pointerPosition]);

  const liveTooltipLayer = React.useMemo(() => {
    // If we are between the first and second click and have a pointer position
    if (tentativeCoords.length === 1 && pointerPosition) {
      // Create a temporary line to the pointer to measure its length
      const liveCoords = [tentativeCoords[0], pointerPosition];
      const lengthInNm = getWorldDistance(liveCoords);

      const text = lengthInNm < 1000 ? `${lengthInNm.toFixed(3)} nm` : `${(lengthInNm / 1000).toFixed(3)} um`;

      return new TextLayer({
        id: 'live-tooltip-layer-live',
        data: [{ position: pointerPosition, text }],
        getPosition: d => d.position,
        getText: d => d.text,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getSize: 16,
        getColor: [255, 255, 255, 255],
        getPixelOffset: [50, 0],
        backgroundColor: [0, 0, 0, 128],
      });
    }

    // If the line is finished (2 clicks), show the final measurement
    if (tentativeCoords.length === 2) {
      const lengthInNm = getWorldDistance(tentativeCoords);
      const text = lengthInNm < 1000 ? `${lengthInNm.toFixed(3)} nm` : `${(lengthInNm / 1000).toFixed(3)} um`;

      return new TextLayer({
        id: 'live-tooltip-layer-final',
        data: [{ position: tentativeCoords[1], text }],
        getPosition: d => d.position,
        getText: d => d.text,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getSize: 16,
        getColor: [255, 255, 255, 255],
        getPixelOffset: [50, 0],
        backgroundColor: [0, 0, 0, 128],
      });
    }

    return null;
  }, [tentativeCoords, pointerPosition]);


  const roiTextLayer = React.useMemo(() => {
    return new TextLayer({
      id: 'roi-text-layer',
      visible: isTextVisible,
      data: roiCollection.features.filter(f => f.properties?.text),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,

      getPosition: (f: VizarrFeature) => {
        const bounds = getFeatureBounds(f);
        return bounds ? [(bounds[0] + bounds[2]) / 2, bounds[3], 0] : [0, 0, 0];
      },

      getText: (f: VizarrFeature): string => f.properties?.text || '',
      getColor: [0, 0, 0, 255],
      sizeUnits: 'pixels',
      getSize: 16,
      sizeMinPixels: 16,
      backgroundColor: [255, 255, 255, 100],
      fontFamily: 'sans-serif',
      textAlign: 'middle',
      getAlignmentBaseline: 'top',
      getPixelOffset: [0, 10],
    } as any);
  }, [roiCollection, isTextVisible,]);

  // NEW: Create the EditableGeoJsonLayer instance using React.useMemo
  // This ensures the layer is only recreated when its data or the mode changes.

  const roiLayer = React.useMemo(() => {
    const modeClass = editMode === 'measureDistance' ? ViewMode : modeMap[editMode];
    return new EditableGeoJsonLayer({
      id: 'roi-layer',
      visible: isRoiVisible,
      data: roiCollection as any,
      mode: modeClass,
      selectedFeatureIndexes: selectedIndex !== null ? [selectedIndex] : [],
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      pickable: true,

      _subLayerProps: {
        guides: {
          // These styles apply to the grey preview shape while drawing
          getFillColor: [0, 0, 0, 0],
          getLineColor: [255, 0, 0, 150],
        }
      },

      onEdit: (action) => {
        setRoiUpdate(action);
      },

      onClick: (info) => {
        if (info.index > -1) {
          setSelectedIndex(info.index);
        } else {
          setSelectedIndex(null);
        }
      },
      getFillColor: (f, isSelected) => isSelected ? [255, 164, 61, 50] : [0, 0, 0, 0],
      getLineColor: (f, isSelected) => isSelected ? [255, 164, 61, 255] : [255, 0, 0, 255],
    });

  }, [editMode, roiCollection, selectedIndex, setRoiUpdate, isRoiVisible, setSelectedIndex]);


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
  const allLayers = [...imageLayers, roiLayer, deleteIconLayer, roiTextLayer, liveTooltipLayer, measurementLineLayer,].filter(Boolean);

  return (
    <DeckGL
      ref={deckRef}
      layers={allLayers} // Pass the combined array to DeckGL
      getCursor={getCursor}
      getTooltip={getTooltip}
      viewState={viewState && { ortho: viewState }}
      onViewStateChange={(e: { viewState: OrthographicViewState }) =>
        // @ts-expect-error - deck doesn't know this should be ok
        setViewState(e.viewState)
      }
      views={[new OrthographicView({ id: "ortho", controller: true })]}
      // this would be for screenshots
      // parameters={{ preserveDrawingBuffer: true }}

      // Measurement logic to circumvent MeasureDistanceModes multi step measurement and dangling lines
      onClick={(info) => {
        // Only run this logic if we are in measure mode and the click was not on an existing ROI
        if (editMode === 'measureDistance' && !info.object) {

          const newPoint = info.coordinate as Position;

          // If a line is already drawn (2 points), this click starts a new one.
          if (tentativeCoords.length >= 2) {
            setTentativeCoords([newPoint]);
            setLiveMeasurement(null); // Hide old tooltip
            return;
          }

          // This is the first click.
          if (tentativeCoords.length === 0) {
            setTentativeCoords([newPoint]);
            setLiveMeasurement(null);
            return;
          }

          // This is the second click, which finishes the measurement.
          if (tentativeCoords.length === 1) {
            const newCoords = [tentativeCoords[0], newPoint];
            setTentativeCoords(newCoords);
            const lengthInNm = getWorldDistance(newCoords);
            const text = lengthInNm < 1000 ? `${lengthInNm.toFixed(3)} nm` : `${(lengthInNm / 1000).toFixed(3)} um`;
            setLiveMeasurement({ text, position: newPoint });

          }
        }
      }}
      onHover={(info) => {
        // Only update the pointer position if we are in the middle of a measurement
        if (editMode === 'measureDistance' && tentativeCoords.length === 1) {
          setPointerPosition(info.coordinate as Position);
        } else {
          // Clear the pointer position when not actively measuring to hide the rubber band
          if (pointerPosition !== null) {
            setPointerPosition(null);
          }
        }
      }}
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