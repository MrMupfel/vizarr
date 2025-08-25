import debounce from 'just-debounce-it';
import * as vizarr from "./src/index";

// this might be a cleaner alternative in the future
//import { createViewer, type ImageLayerConfig, type ViewState } from './src/index';

// This listener waits for the HTML page to be fully loaded before running any code - fixes the error I observerd before when integrating into django.
document.addEventListener('DOMContentLoaded', () => {
  async function main() {
    // Since this runs after DOMContentLoaded, we know the #root element exists.
    const root = document.querySelector<HTMLElement>("#root")!;

    // Check for data attributes passed from the Django template.
    if (root.dataset.imageId) {
      console.log("Running in PRODUCTION mode (from Django template)");
      (window as any).vizarrApi = {
        imageId: parseInt(root.dataset.imageId, 10),
        roisUrl: root.dataset.roisUrl || '',
        userName: root.dataset.userName || '',
      };
    } else {
      // Fallback for local development if no Django data is found.
      console.warn("Running in DEVELOPMENT mode: No Django data attributes found.");
      (window as any).vizarrApi = {
        imageId: 2, // Example ID for local dev
        roisUrl: `/viewer/api/images/2/rois/`,
        userName: 'dev-user',
      };
    }

    const viewer = await vizarr.createViewer(root);
    console.log(`vizarr v${vizarr.version}: https://github.com/hms-dbmi/vizarr`);

    const url = new URL(window.location.href);

    if (!url.searchParams.has("source")) {
      return;
    }
    
    // Restore viewState if it exists in the URL.
    const viewStateString = url.searchParams.get("viewState");
    if (viewStateString) {
      const viewState = JSON.parse(viewStateString);
      viewer.setViewState(viewState);
    }

    // Add event listener to sync viewState as a query parameter.
    viewer.on(
      "viewStateChange",
      debounce((update: vizarr.ViewState) => {
        const url = new URL(window.location.href);
        url.searchParams.set("viewState", JSON.stringify(update));
        window.history.pushState({}, "", decodeURIComponent(url.href));
      }, 200),
    );

    // Parse image config from URL search parameters.
    // @ts-expect-error - TODO: validate config
    const config: vizarr.ImageLayerConfig = {};

    for (const [key, value] of url.searchParams) {
      // @ts-expect-error - TODO: validate config
      config[key] = value;
    }

    // If the source is a relative path (for the proxy), make it absolute.
    if (config.source && typeof config.source === 'string' && config.source.startsWith('/')) {
      config.source = `${window.location.origin}${config.source}`;
    }

    viewer.addImage(config);

    // Update browser history.
    const newLocation = decodeURIComponent(url.href);

    if (window.location.href !== newLocation) {
      window.history.pushState(null, "", newLocation);
    }
  }

  // This is the only place main() should be called.
  main();
});