"use client";

import Image, { type ImageLoaderProps, type ImageProps } from "next/image";

function cloudinaryLoader({ src, width }: ImageLoaderProps) {
  return src.replace("/image/upload/", `/image/upload/f_auto,q_auto,c_limit,w_${width}/`);
}

/** Keep responsive image delivery on Cloudinary, without proxying through Next. */
export function StoreImage({ alt, ...props }: Omit<ImageProps, "loader" | "unoptimized">) {
  const cloudinary = props.src.toString().startsWith("https://res.cloudinary.com/");
  return <Image {...props} alt={alt} loader={cloudinary ? cloudinaryLoader : undefined} unoptimized={!cloudinary} />;
}
