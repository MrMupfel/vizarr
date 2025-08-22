import debounce from "just-debounce-it";
import * as vizarr from "./src/index";

// --- ADD THIS BLOCK FOR DEVELOPMENT ---
// This simulates the data Django will provide in production.
// It connects your locally served dataset to its database entry.
// const DEV_IMAGE_ID = 2; // for test1.ome.zarr ID is 2
// (window as any).vizarrApi = {
//   imageId: DEV_IMAGE_ID,
//   // The API URL now points to the correct, specific endpoint for this image
//   roisUrl: `/viewer/api/images/${DEV_IMAGE_ID}/rois/`,
//   userName: 'dev-user', // A placeholder username
// };
// ------------------------------------

function initializeApi() {
  const root = document.getElementById('root');

  // Check if data attributes are present (i.e., we are in the Django environment).
  if (root && root.dataset.imageId) {
    console.log("Running in PRODUCTION mode (from Django template)");
    const imageId = parseInt(root.dataset.imageId, 10);
    (window as any).vizarrApi = {
      imageId: imageId,
      roisUrl: root.dataset.roisUrl || '',
      userName: root.dataset.userName || '',
    };
  } else {
    // Fallback for Vite's development environment.
    console.log("Running in DEVELOPMENT mode (with hardcoded values)");
    const DEV_IMAGE_ID = 2; // <-- Change this to the ID you want to test with
    (window as any).vizarrApi = {
      imageId: DEV_IMAGE_ID,
      roisUrl: `/viewer/api/images/${DEV_IMAGE_ID}/rois/`,
      userName: 'dev-user',
    };
  }
}
initializeApi();

async function main() {
  console.log(`vizarr v${vizarr.version}: https://github.com/hms-dbmi/vizarr`);
  // biome-ignore lint/style/noNonNullAssertion: We know the element exists
  const viewer = await vizarr.createViewer(document.querySelector("#root")!);
  const url = new URL(window.location.href);

  if (!url.searchParams.has("source")) {
    return;
  }

  // see if we have initial viewState
  const viewStateString = url.searchParams.get("viewState");
  if (viewStateString) {
    const viewState = JSON.parse(viewStateString);
    viewer.setViewState(viewState);
  }

  // Add event listener to sync viewState as query param.
  // Debounce to limit how quickly we are pushing to browser history
  viewer.on(
    "viewStateChange",
    debounce((update: vizarr.ViewState) => {
      const url = new URL(window.location.href);
      url.searchParams.set("viewState", JSON.stringify(update));
      window.history.pushState({}, "", decodeURIComponent(url.href));
    }, 200),
  );

  // parse image config
  // @ts-expect-error - TODO: validate config
  const config: vizarr.ImageLayerConfig = {};

  for (const [key, value] of url.searchParams) {
    // @ts-expect-error - TODO: validate config
    config[key] = value;
  }

  // DEV ================================================================= DEV
  // If the source is a relative path (for the proxy), make it absolute.
  if (config.source && typeof config.source === 'string' && config.source.startsWith('/')) {
    config.source = `${window.location.origin}${config.source}`;
  }
  // DEV ================================================================= DEV

  // Make sure the source URL is decoded.
  viewer.addImage(config);

  const newLocation = decodeURIComponent(url.href);

  // Only update history if the new loacation is different from the current
  if (window.location.href !== newLocation) {
    window.history.pushState(null, "", newLocation);
  }
}

main();
