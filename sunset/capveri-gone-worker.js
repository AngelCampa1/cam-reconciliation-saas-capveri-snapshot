export default {
  fetch() {
    return new Response(null, {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-CapVeri-Sunset": "true",
      },
    });
  },
};
