import { after } from "@lib/api/patcher";
import { findInReactTree } from "@lib/utils";
import { TableRow } from "@metro/common/components";
import { findByNameLazy, findByPropsLazy } from "@metro/wrappers";
import { registeredSections } from "@ui/settings";

import { CustomPageRenderer, wrapOnPress } from "./shared";

const settingConstants = findByPropsLazy("SETTING_RENDERER_CONFIG");
const SettingsOverviewScreen = findByNameLazy("SettingsOverviewScreen", false);

function useIsFirstRender() {
    let firstRender = false;
    React.useEffect(() => void (firstRender = true), []);
    return firstRender;
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

    unpatches.push(after("default", SettingsOverviewScreen, (_, ret) => {
        if (useIsFirstRender()) return; // :shrug:

        // Discord has changed this tree several times. 305 and older expose the
        // list as props.sections, while 306+ wraps it in props.node.sections.
        // Do not assume that the first matching tree node exists or that the
        // SettingsOverviewScreen is only rendered once.
        const target = findInReactTree(ret, i =>
            Array.isArray(i?.props?.sections) || Array.isArray(i?.props?.node?.sections)
        );
        const sections = target?.props?.sections ?? target?.props?.node?.sections;
        if (!Array.isArray(sections)) return;

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
