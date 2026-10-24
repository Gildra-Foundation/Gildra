import { AuctionPage, auctionMetadata } from "@/components/wow/auction/AuctionPage";
export const metadata = auctionMetadata("en");
export default function Page() { return <AuctionPage lang="en" />; }
