import type { ComponentProps } from "react";
import { MaterialButton, MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { auctionBaseKit, auctionButtonStyle, auctionPlaqueStyle } from "./auctionKit";

type PlaqueProps = Omit<ComponentProps<typeof MaterialPlaque>, "kit">;
type ButtonProps = Omit<ComponentProps<typeof MaterialButton>, "kit">;

/** The shared painted plaque wearing the Auction House kit (the kit variables override the base kit's). */
export function AuctionPlaque({ style, ...props }: PlaqueProps) {
  return <MaterialPlaque kit={auctionBaseKit} {...props} style={{ ...auctionPlaqueStyle(), ...style }} />;
}

/** The shared painted button wearing the Auction House kit. */
export function AuctionButton({ style, ...props }: ButtonProps) {
  return <MaterialButton kit={auctionBaseKit} {...props} style={{ ...auctionButtonStyle(), ...style }} />;
}
