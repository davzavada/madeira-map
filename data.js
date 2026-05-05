// Four points around Madeira — one per cardinal direction so the whole
// island is legible at a glance: Seixal (north), Calheta (south-west),
// Funchal (south), Machico (east). All four carry a live webcam.
window.MADEIRA_LOCATIONS = [
  {
    id: "funchal",
    name: "Funchal",
    region: "south",
    tier: 1,
    lat: 32.6469, lon: -16.9098,
    webcam: {
      title: "Funchal — kopce São Roque",
      youtubeId: "kLsk1pZ5YeY",
      page: "https://www.madeira-web.com/en/webcams/funchal-city-livecam.html"
    }
  },
  {
    id: "calheta",
    name: "Calheta",
    region: "sw",
    tier: 1,
    lat: 32.7197, lon: -17.1772,
    webcam: {
      title: "Pláž Calheta",
      youtubeId: "t4x0u0ARLwo",
      page: "https://www.madeira-web.com/en/webcams/calheta-beach-livecam.html"
    }
  },
  {
    id: "seixal",
    name: "Seixal",
    region: "north",
    tier: 1,
    lat: 32.8259, lon: -17.1042,
    webcam: {
      title: "Seixal — Netmadeira",
      youtubeId: "WwOuI_G5WUI",
      page: "https://www.netmadeira.com/webcams-madeira/seixal"
    }
  },
  {
    id: "porto-moniz",
    name: "Porto Moniz",
    region: "nw",
    tier: 1,
    anchorSide: "right",   // tile extends west into the ocean — keeps it from
                           // overlapping Seixal which sits just to the east
    lat: 32.8675, lon: -17.1731,
    webcam: {
      title: "Porto Moniz — Netmadeira",
      netmadeiraSlug: "porto-moniz",
      page: "https://www.netmadeira.com/webcams-madeira/porto-moniz"
    }
  },
  {
    id: "machico",
    name: "Machico",
    region: "east",
    tier: 1,
    lat: 32.7177, lon: -16.7665,
    webcam: {
      title: "Přístav Machico",
      youtubeId: "wbGK0x5QZes",
      page: "https://www.madeira-web.com/en/webcams/port-machico-city-livecam.html"
    }
  }
];

// Smaller weather-only points across the island. They appear only when the
// user zooms in (zoom ≥ 12). No webcam, no detail panel — just a temp + rain
// chip so you can see how the weather varies between coastal towns and the
// interior at a glance.
window.MADEIRA_MICRO_POINTS = [
  // east / interior
  { id: "curral",         name: "Curral das Freiras",lat: 32.7232, lon: -16.9659 },
  { id: "ribeiro-frio",   name: "Ribeiro Frio",      lat: 32.7333, lon: -16.8819 },
  { id: "porto-da-cruz",  name: "Porto da Cruz",     lat: 32.7727, lon: -16.8252 },
  { id: "canical",        name: "Caniçal",           lat: 32.7404, lon: -16.7372 },
  // south / west — one point per coastal area, no duplicates within ~5 km
  { id: "camara-de-lobos",name: "Câmara de Lobos",   lat: 32.6555, lon: -16.9764 },
  { id: "ponta-do-sol",   name: "Ponta do Sol",      lat: 32.6794, lon: -17.0992 },
  { id: "paul-do-mar",    name: "Paul do Mar",       lat: 32.7626, lon: -17.2342 },
  { id: "ponta-do-pargo", name: "Ponta do Pargo",    lat: 32.8088, lon: -17.2532 }
];

window.MAPY_API_KEY = "2IzDMU4fsLf7Mb_1PTHe-h0TobqUljqDBTA8oF0y2fo";
window.MADEIRA_BOUNDS = [[32.20, -18.00], [33.20, -16.00]];

// Tight bounding box of the island used to frame the initial view so the
// island fills the viewport with a small margin on every screen size.
window.MADEIRA_ISLAND_BOUNDS = [[32.63, -17.27], [32.93, -16.65]];
