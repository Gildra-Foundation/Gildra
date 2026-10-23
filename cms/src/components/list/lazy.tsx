"use client";

import dynamic from "next/dynamic";

/*
 * The workbench list's client parts in their own chunk. Payload's import map
 * loads every admin component on every admin page; through these the list
 * code (filters, Valyro pagination, the table adapter) is fetched only where a
 * list is shown. They still render on the server, so nothing pops in.
 */
export const ListControls = dynamic(() => import("./ListControls").then((m) => m.ListControls));
export const ListPager = dynamic(() => import("./ListControls").then((m) => m.ListPager));
export const ResetListButton = dynamic(() => import("./ListControls").then((m) => m.ResetListButton));
export const ListTable = dynamic(() => import("./ListTable").then((m) => m.ListTable));
export const ListModeSwitch = dynamic(() => import("./ListTable").then((m) => m.ListModeSwitch));
export const MediaGrid = dynamic(() => import("./MediaGrid").then((m) => m.MediaGrid));
