import patchErrorBoundary from "@core/debug/patches/patchErrorBoundary";
import initFixes from "@core/fixes";
import { initFetchI18nStrings } from "@core/i18n";
import initSettings from "@core/ui/settings";
import { initVendettaObject } from "@core/vendetta/api";
import { VdPluginManager } from "@core/vendetta/plugins";
import { updateFonts } from "@lib/addons/fonts";
import { initPlugins, updatePlugins } from "@lib/addons/plugins";
import { initThemes } from "@lib/addons/themes";
import { patchCommands } from "@lib/api/commands";
import { patchLogHook } from "@lib/api/debug";
import { injectFluxInterceptor } from "@lib/api/flux";
import { patchJsx } from "@lib/api/react/jsx";
import { logger } from "@lib/utils/logger";
import { patchSettings } from "@ui/settings";

import * as lib from "./lib";

export default async () => {
    // Load everything in parallel
    const initializers = [
        initThemes,
        injectFluxInterceptor,
        patchSettings,
        patchLogHook,
        patchCommands,
        patchJsx,
        initVendettaObject,
        initFetchI18nStrings,
        initSettings,
        initFixes,
        patchErrorBoundary,
        updatePlugins
    ];
    const initialization = await Promise.allSettled(
        initializers.map(initializer => Promise.resolve().then(() => initializer()))
    );

    // A broken optional patch must not prevent the settings, logger, and
    // recovery UI from starting. Discord changes private modules frequently,
    // so keep successful initializers and expose failures for diagnosis.
    initialization.forEach(result => {
        if (result.status === "fulfilled") {
            if (result.value) lib.unload.push(result.value);
        } else {
            console.error("SChat initializer failed", result.reason);
        }
    });

    // Assign window object
    window.schat = lib;

    // Once done, load Vendetta plugins
    VdPluginManager.initPlugins()
        .then(u => lib.unload.push(u))
        .catch(() => alert("Failed to initialize Vendetta plugins"));

    // And then, load SChat plugins
    initPlugins();

    // Update the fonts
    updateFonts();

    // We good :)
    logger.log("SChat is ready!");
};
