import { Grid, IconButton, Tooltip, Divider, FormControlLabel, Switch, Typography } from "@material-ui/core";
import { Add, Remove, CropSquare, ControlCameraRounded, FormatShapesRounded, ChangeHistoryRounded, StraightenRounded } from "@material-ui/icons";
import { makeStyles } from "@material-ui/styles";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useReducer } from "react";

import { SourceDataContext } from "../hooks";
import { sourceInfoAtomAtoms, viewStateAtom } from "../state";
import { editModeAtom, type EditMode, isTextVisibleAtom, isRoiVisibleAtom } from "../roi-state";
import LayerController from "./LayerController";

const useStyles = makeStyles({
  root: {
    zIndex: 1,
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: "5px",
    left: "5px",
    top: "5px",
    color: "#fff",
  },
  scroll: {
    maxHeight: 500,
    overflowX: "hidden",
    overflowY: "scroll",
    "&::-webkit-scrollbar": {
      display: "none",
      background: "transparent",
    },
    scrollbarWidth: "none",
    flexDirection: "column",
  },
  toolbar: {
    padding: "2px 4px",
    backgroundColor: "rgba(0, 0, 0, 0.59)",
    borderRadius: "4px",
  },
  visibility: {
    padding: "2px 4px",
  },  
});

function Menu(props: { open?: boolean }) {
  const sourceAtoms = useAtomValue(sourceInfoAtomAtoms);
  const [hidden, toggle] = useReducer((v) => !v, !(props.open ?? true));
  const classes = useStyles();

  // Get the current mode and the function to change it from our ROI state file
  const currentMode = useAtomValue(editModeAtom);
  const setEditMode = useSetAtom(editModeAtom);
  const [isTextVisible, setIsTextVisible] = useAtom(isTextVisibleAtom);
  const [isRoiVisible, setIsRoiVisible] = useAtom(isRoiVisibleAtom);


  // Helper function to create a button
  const ToolButton = ({
    title,
    mode,
    children,
  }: {
    title: string;
    mode: EditMode;
    children: React.ReactNode;
  }) => (
    <Tooltip title={title}>
      <IconButton
        onClick={() => setEditMode(mode)}
        style={{ color: currentMode === mode ? '#ffbf77' : 'inherit' }}
        size="small"
      >
        {children}
      </IconButton>
    </Tooltip>
  );

  return (
    <div className={classes.root} style={{ padding: `0px 5px ${hidden ? 0 : 5}px 5px` }}>
      <Grid container direction="column" alignItems="flex-start">
        <IconButton style={{ backgroundColor: "transparent", padding: "4px 0" }} onClick={toggle} color="inherit">
          {hidden ? <Add /> : <Remove />}
        </IconButton>
        <div style={{ display: hidden ? "none" : "block", width: '100%' }}>
          {/* ROI Drawing Toolbar */}
          <Grid container direction="row" className={classes.toolbar}>
            <ToolButton title="Pan & Zoom" mode="view">
              <ControlCameraRounded />
            </ToolButton>
            <ToolButton title="Draw Polygon" mode="drawPolygon">
              <ChangeHistoryRounded />
            </ToolButton>
            <ToolButton title="Draw Rectangle" mode="drawRectangle">
              <CropSquare />
            </ToolButton>
            <ToolButton title="Edit/Modify ROI" mode="modify">
              <FormatShapesRounded />
            </ToolButton>
            <ToolButton title="Measure Distance" mode="measureDistance">
              <StraightenRounded />
            </ToolButton>
          </Grid>


          <Grid container direction="row" className={classes.visibility}> 
          {/* Label Visibility Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={isTextVisible}
                  onChange={(event) => setIsTextVisible(event.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label={<Typography style={{ fontSize: '0.9rem', color: '#fff' }}>Labels</Typography>}
            />

          {/* Roi Visibility Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={isRoiVisible}
                  onChange={(event) => setIsRoiVisible(event.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label={<Typography style={{ fontSize: '0.9rem', color: '#fff' }}>ROIs</Typography>}
            />
          </Grid>

          <Divider />

          {/* Existing Layer Controllers */}
          <div className={classes.scroll} style={{ display: "flex" }}>
            {sourceAtoms.map((sourceAtom) => (
              <SourceDataContext.Provider key={`${sourceAtom}`} value={sourceAtom}>
                <LayerController />
              </SourceDataContext.Provider>
            ))}
          </div>
        </div>
      </Grid>
    </div>
  );
}

export default Menu;