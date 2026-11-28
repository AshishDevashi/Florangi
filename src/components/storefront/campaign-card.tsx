import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StoreImage } from "./store-image";
import { collectionLabel, type HomeCategory } from "./types";
import styles from "./home.module.css";

type CampaignCardProps = {
  category: HomeCategory;
  eyebrow: string;
  imageIndex?: number;
  wide?: boolean;
};

export function CampaignCard({ category, eyebrow, imageIndex = 1, wide = false }: CampaignCardProps) {
  const name = collectionLabel(category.name);
  const image = category.images[imageIndex]?.url ?? category.images[0]?.url;

  return (
    <Link
      href={`/collections/${category.slug}`}
      className={`${styles.campaignCard} ${wide ? styles.wideCampaign : ""}`}
      aria-label={`Shop ${name}`}
    >
      <StoreImage
        src={image ?? "/images/demo-dress.svg"}
        alt={`${name} dress collection`}
        fill
        sizes={wide ? "(max-width: 700px) 100vw, 60vw" : "(max-width: 700px) 100vw, 50vw"}
        className={styles.coverImage}
      />
      <div className={styles.campaignCaption}>
        <p>{eyebrow}</p>
        <h3>{name}</h3>
        <span>Shop the collection <ArrowUpRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
