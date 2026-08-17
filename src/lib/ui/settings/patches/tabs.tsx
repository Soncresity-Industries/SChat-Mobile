import { after } from "@lib/api/patcher";
import { TableRow } from "@metro/common/components";
import { findByNameLazy, findByPropsLazy } from "@metro/wrappers";
import { registeredSections } from "@ui/settings";

import { CustomPageRenderer, wrapOnPress } from "./shared";

const settingConstants = findByPropsLazy("SETTING_RENDERER_CONFIG");
const SettingsOverviewScreen = findByNameLazy("SettingsOverviewScreen", false);

function findSettingsSections(root: any): any[] | undefined {
    const visited = new Set<any>();

    function visit(value: any): any[] | undefined {
        if (!value || (typeof value !== "object" && typeof value !== "function") || visited.has(value)) return;
        visited.add(value);

        if (Array.isArray(value)) {
            if (value.some(section => Array.isArray(section?.settings) && section.settings.includes("ACCOUNT"))) {
                return value;
            }
            for (const item of value) {
                const result = visit(item);
                if (result) return result;
            }
            return;
        }

        // Discord has moved this list among several React wrappers. Search the
        // returned tree for its stable ACCOUNT settings marker instead of a
        // particular props path.
        for (const key of Object.keys(value)) {
            const result = visit(value[key]);
            if (result) return result;
        }
    }

    return visit(root);
}

export function patchTabsUI(unpatches: (() => void | boolean)[]) {
    const getRows = () => Object.values(registeredSections)
        .flatMap(sect => sect.map(row => ({
            [row.key]: {
                type: "pressable",
                title: row.title,
                icon: row.icon,
                IconComponent: () => <TableRow.Icon source={row.icon} />,
                usePredicate: row.usePredicate,
                useTrailing: row.useTrailing,
                onPress: wrapOnPress(row.onPress, null, row.render, row.title()),
                withArrow: true,
                ...row.rawTabsConfig
            }
        })))
        .reduce((a, c) => Object.assign(a, c));

    try {
        const origRendererConfig = settingConstants.SETTING_RENDERER_CONFIG;
        let rendererConfigValue = settingConstants.SETTING_RENDERER_CONFIG;

        Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", {
            enumerable: true,
            configurable: true,
            get: () => ({
                ...rendererConfigValue,
                VendettaCustomPage: {
                    type: "route",
                    title: () => "SChat",
                    screen: {
                        route: "VendettaCustomPage",
                        getComponent: () => CustomPageRenderer
                    }
                },
                SCHAT_CUSTOM_PAGE: {
                    type: "route",
                    title: () => "SChat",
                    screen: {
                        route: "SCHAT_CUSTOM_PAGE",
                        getComponent: () => CustomPageRenderer
                    }
                },
                ...getRows()
            }),
            set: v => rendererConfigValue = v,
        });

        unpatches.push(() => {
            Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", {
                value: origRendererConfig,
                writable: true,
                get: undefined,
                set: undefined
            });
        });
    } catch (error) {
        // The category insertion below remains usable if Discord freezes this
        // object or changes the renderer contract again.
        console.warn("Unable to patch the settings renderer configuration", error);
    }

    unpatches.push(after("default", SettingsOverviewScreen, (_, ret) => {
        const sections = findSettingsSections(ret);
        if (!sections) return;

        const sectionNames = Object.keys(registeredSections);

        // The same array can be retained between renders. Remove our previous
        // entries before inserting them again so the category neither duplicates
        // nor gradually moves through the settings list.
        for (let i = sections.length - 1; i >= 0; i--) {
            const settings = sections[i]?.settings;
            if (
                sectionNames.includes(sections[i]?.label)
                || (Array.isArray(settings) && settings.some((key: string) =>
                    Object.values(registeredSections).some(rows => rows.some(row => row.key === key))
                ))
            ) {
                sections.splice(i, 1);
            }
        }

        // Credit to @palmdevs - https://discord.com/channels/1196075698301968455/1243605828783571024/1307940348378742816
        const accountIndex = sections.findIndex((section: any) =>
            Array.isArray(section?.settings) && section.settings.includes("ACCOUNT")
        );
        let index = accountIndex >= 0 ? accountIndex + 1 : 1;

        sectionNames.forEach(sect => {
            sections.splice(index++, 0, {
                label: sect,
                title: sect,
                settings: registeredSections[sect].map(a => a.key)
            });
        });
    }));
}
