"use client";

import dynamic from "next/dynamic";

// Every page carries its layout's 404 boundary, so whatever the 404 imports ships
// with every page. The suggestions render nothing on the server (they read the
// lost address in the browser): load their code (search index, kit tables) only
// when a 404 is actually shown.
export const LazyNotFoundSuggestions = dynamic(() => import("./NotFoundSuggestions").then((module) => module.NotFoundSuggestions), { ssr: false });
