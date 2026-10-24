import { AuctionPage, auctionMetadata } from "@/components/wow/auction/AuctionPage";
export const metadata = auctionMetadata("ru");
export default function Page() { return <AuctionPage lang="ru" />; }
