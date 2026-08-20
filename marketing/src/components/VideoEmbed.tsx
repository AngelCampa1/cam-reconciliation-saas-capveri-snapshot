"use client";

import { useState } from "react";
import Image from "next/image";

interface VideoEmbedProps {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
}

export function VideoEmbed({
  youtubeId,
  title,
  thumbnailUrl,
}: VideoEmbedProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black group cursor-pointer">
      <Image
        src={thumbnailUrl}
        alt={title}
        fill
        className="object-cover transition-opacity duration-200 group-hover:opacity-80"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
      <button
        type="button"
        aria-label={`Play video: ${title}`}
        onClick={() => setPlaying(true)}
        className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white/90 shadow-lg group-hover:bg-white transition-colors duration-200">
          <svg
            className="w-6 h-6 text-primary ml-1"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </button>
    </div>
  );
}
