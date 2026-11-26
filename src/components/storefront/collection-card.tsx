import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StoreImage } from "./store-image";
import { collectionLabel, type HomeCategory } from "./types";
import styles from "./home.module.css";

type CollectionCardProps = {
  category: HomeCategory;
  headingLevel?: "h2" | "h3";
  loading?: "eager" | "lazy";
};

export function CollectionCard({ category, headingLevel: Heading = "h2", loading = "lazy" }: CollectionCardProps) {
  return (
    <Link className={styles.collectionCard} href={`/collections/${category.slug}`}>
      <StoreImage
        src={category.images[0]?.url ?? "/images/demo-dress.svg"}
        alt=""
        fill
        loading={loading}
        sizes="(max-width: 700px) 100vw, 33vw"
        className={styles.coverImage}
      />
      <div className={styles.collectionCardCaption}>
        <Heading>{collectionLabel(category.name)}</Heading>
        <span className={styles.collectionCardAction}>
          <span>Explore collection</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
