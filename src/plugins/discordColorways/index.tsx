/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { disableStyle, enableStyle } from "@api/Styles";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Flex, FluxDispatcher, Menu, PermissionsBits, PermissionStore, SelectedChannelStore, Text } from "@webpack/common";
import { FluxEvents } from "@webpack/types";

import ColorwaysButton from "./components/colorwaysButton";
import { SwatchIcon } from "./components/icons";
import { ToolboxModal } from "./components/toolbox";
import style from "./style.css?managed";

export let ColorPicker: React.ComponentType<any> = () => <Text variant="heading-md/semibold" tag="h2" className="colorways-creator-module-warning">Module is lazyloaded, open Settings first</Text>;

export let LazySwatchLoaded = false;
DataStore.get("colorwaySourceFiles").then(e => { if (!e) DataStore.set("colorwaySourceFiles", ["https://raw.githubusercontent.com/DaBluLite/DiscordColorways/master/index.json"]); });
DataStore.get("customColorways").then(e => { if (!e) DataStore.set("customColorways", []); });

export const ColorwayCSS = {
    get: () => document.getElementById("activeColorwayCSS")?.textContent || "",
    set: (e: string) => {
        if (!document.getElementById("activeColorwayCSS")) {
            var activeColorwayCSS: HTMLStyleElement = document.createElement("style");
            activeColorwayCSS.id = "activeColorwayCSS";
            activeColorwayCSS.textContent = e;
            document.head.append(activeColorwayCSS);
        } else document.getElementById("activeColorwayCSS")!.textContent = e;
    },
    remove: () => document.getElementById("activeColorwayCSS")!.remove()
};


const ctxMenuPatch: NavContextMenuPatchCallback = (children, props) => () => {
    if (props.channel.guild_id && !(PermissionStore.can(PermissionsBits.SEND_MESSAGES, props.channel))) return;
    children.push(
        <Menu.MenuItem
            id="colorways-send-id"
            label={
                <>
                    <Flex flexDirection="row" style={{ alignItems: "center", gap: 8 }}>
                        <SwatchIcon viewboxX={16} viewboxY={16} style={{ scale: "0.8" }} />
                        Share Colorway via ID
                    </Flex>
                </>
            }
            action={() => {
                function getHex(str: string): string { return Object.assign(document.createElement("canvas").getContext("2d") as {}, { fillStyle: str }).fillStyle; }
                const stringToHex = (str: string) => {
                    let hex = "";
                    for (let i = 0; i < str.length; i++) {
                        const charCode = str.charCodeAt(i);
                        const hexValue = charCode.toString(16);
                        hex += hexValue.padStart(2, "0");
                    }
                    return hex;
                };
                const colorwayIDArray = `#${getHex(getComputedStyle(document.body).getPropertyValue("--brand-experiment")).split("#")[1]},#${getHex(getComputedStyle(document.body).getPropertyValue("--background-primary")).split("#")[1]},#${getHex(getComputedStyle(document.body).getPropertyValue("--background-secondary")).split("#")[1]},#${getHex(getComputedStyle(document.body).getPropertyValue("--background-tertiary")).split("#")[1]}`;
                const colorwayID = stringToHex(colorwayIDArray);
                const channelId = SelectedChannelStore.getChannelId();
                sendMessage(channelId, { content: `\`colorway:${colorwayID}\`` });
            }}
        />
    );
};

export var ws = new WebSocket("ws://127.0.0.1:5682");

interface WSMessage {
    type: string;
    [x: string]: string;
}

type FluxEventsWithColorways = FluxEvents | "SET_COLORWAY";

function connect() {
    ws.onopen = function () {
        ws.send('{ "type": "CLIENT_CONNECTED", "client_type": "CLIENT" }');
    };

    ws.onmessage = function (e) {
        e.data.text().then(msg => {
            const data: WSMessage = JSON.parse(msg);
            switch (data.type) {
                case "SET_COLORWAY":
                    DataStore.get("actveColorwayID").then((actveColorwayID: string) => {
                        if (actveColorwayID === data.id) {
                            DataStore.set("actveColorwayID", null);
                            DataStore.set("actveColorway", null);
                            ColorwayCSS.remove();
                            FluxDispatcher.dispatch({
                                id: null,
                                css: null,
                                type: "SET_COLORWAY",
                            });
                        } else {
                            DataStore.set("actveColorwayID", data.id);
                            DataStore.set("actveColorway", data.css);
                            ColorwayCSS.set(data.css || "");
                            FluxDispatcher.dispatch({
                                id: data.id,
                                css: data.css,
                                type: "SET_COLORWAY",
                            });
                        }
                    });
                    break;
            }
        });
    };

    ws.onclose = function (e) {
        ws.send('{ "type": "CLIENT_DISCONNECTED", "client_type": "CLIENT" }');
        console.log("Socket is closed. Reconnect will be attempted in 1 second.", e.reason);
        setTimeout(function () {
            connect();
        }, 1000);
    };

    ws.onerror = function (err) {
        ws.send('{ "type": "CLIENT_DISCONNECTED", "client_type": "CLIENT" }');
        console.error("Socket encountered error: ", err, "Closing socket");
        ws.close();
    };
}

connect();

onbeforeunload = () => ws.send('{ "type": "CLIENT_DISCONNECTED", "client_type": "CLIENT" }');

export default definePlugin({
    name: "DiscordColorways",
    description: "The definitive way to style Discord.",
    authors: [Devs.DaBluLite, Devs.ImLvna],
    dependencies: ["ServerListAPI"],
    creatorVersion: "1.14",
    toolboxActions: {
        "Open Toolbox": () => openModal(props => <ToolboxModal modalProps={props} />)
    },
    patches: [
        {
            find: ".colorPickerFooter",
            replacement: {
                match: /function (\i).{0,200}\.colorPickerFooter/,
                replace: "$self.ColorPicker=$1;$&"
            }
        }
    ],
    set ColorPicker(e: any) {
        ColorPicker = e;
        LazySwatchLoaded = true;
    },
    start: () => {
        enableStyle(style);


        DataStore.get("actveColorway").then(activeColorway => {
            ColorwayCSS.set(activeColorway);
            DataStore.get("actveColorwayID").then(activeColorwayID => {
                ws.send(`{ "type": "SET_HELPER_COLOR", "id": "${activeColorwayID}", "css": "${activeColorway}" }`);
            });
        });
        addContextMenuPatch("channel-attach", ctxMenuPatch);
        addServerListElement(ServerListRenderPosition.Above, () => <ColorwaysButton />);
    },
    stop: () => {
        disableStyle(style);
        removeServerListElement(ServerListRenderPosition.Above, () => <ColorwaysButton />);
        ColorwayCSS.remove();
        removeContextMenuPatch("channel-attach", ctxMenuPatch);
        ws.send('{ "type": "CLIENT_DISCONNECTED", "client_type": "CLIENT" }');
    }
});
