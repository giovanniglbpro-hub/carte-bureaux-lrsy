// ===============================
//  Références DOM
// ===============================
const selectBV         = document.getElementById('selectBV');
const maskOpacityInp   = document.getElementById('maskOpacity');
const othersOpacityInp = document.getElementById('othersOpacity');
const bureauColorInp   = document.getElementById('bureauColor');
const maskColorInp     = document.getElementById('maskColor');
const maskOpacityVal   = document.getElementById('maskOpacityVal');
const othersOpacityVal = document.getElementById('othersOpacityVal');

const searchInput  = document.getElementById('searchInput');
const searchBtn    = document.getElementById('searchBtn');
const searchStatus = document.getElementById('searchStatus');

const exportBtn    = document.getElementById('exportBtn');

// ===============================
//  Carte Leaflet
// ===============================
const map = L.map('map').setView([46.67, -1.43], 13); // centre LRSY

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

let geojsonLayer = null;
let darkMask = null;
let searchMarker = null;
let selectedNumero = null;

// ===============================
//  Helpers réglages
// ===============================
function getMaskOpacity() {
  return Number(maskOpacityInp.value) / 100;
}

function getOthersOpacity() {
  return Number(othersOpacityInp.value) / 100;
}

function getBureauColor() {
  return bureauColorInp.value;
}

function getMaskColor() {
  return maskColorInp.value;
}

// ===============================
//  Styles
// ===============================
function styleDefault(feature) {
  return {
    color: '#000000',
    weight: 1,
    fillColor: getMaskColor(),
    fillOpacity: getOthersOpacity()
  };
}

// ===============================
//  Masque sombre
// ===============================
function createMask(excludedLayer) {
  if (darkMask) {
    map.removeLayer(darkMask);
    darkMask = null;
  }

  if (!excludedLayer) return;

  const outerRing = [
    [90, -180],
    [90, 180],
    [-90, 180],
    [-90, -180]
  ];

  let rings = excludedLayer.getLatLngs();
  let innerRing;

  if (Array.isArray(rings[0][0])) {
    innerRing = rings[0][0]; // MultiPolygon
  } else {
    innerRing = rings[0];    // Polygon simple
  }

  darkMask = L.polygon(
    [outerRing, innerRing],
    {
      color: getMaskColor(),
      weight: 0,
      fillColor: getMaskColor(),
      fillOpacity: getMaskOpacity(),
      fillRule: 'evenodd'
    }
  ).addTo(map);

  if (geojsonLayer) geojsonLayer.bringToFront();
}

// ===============================
//  Appliquer les styles
// ===============================
function applyStyles() {
  if (!geojsonLayer) return;

  let highlightedLayer = null;

  geojsonLayer.eachLayer(layer => {
    const num = layer.feature.properties.numeroBureauVote;

    if (selectedNumero && String(num) === String(selectedNumero)) {
      layer.setStyle({
        color: getBureauColor(),
        weight: 3,
        fillColor: getBureauColor(),
        fillOpacity: 0
      });
      highlightedLayer = layer;
      layer.bringToFront();
    } else {
      layer.setStyle(styleDefault(layer.feature));
    }
  });

  if (highlightedLayer) {
    createMask(highlightedLayer);
  } else {
    createMask(null);
  }
}

// ===============================
//  Sélection d'un bureau
// ===============================
function setHighlighted(numero) {
  selectedNumero = numero || null;
  applyStyles();

  if (geojsonLayer && selectedNumero) {
    geojsonLayer.eachLayer(layer => {
      const num = layer.feature.properties.numeroBureauVote;
      if (String(num) === String(selectedNumero)) {
        map.fitBounds(layer.getBounds(), { maxZoom: 17 });
      }
    });
  }
}

// ===============================
//  Chargement du GeoJSON
// ===============================
fetch('bureaux.geojson')
  .then(response => response.json())
  .then(data => {
    const dejaAjoutes = new Set();

    geojsonLayer = L.geoJSON(data, {
      style: styleDefault,
      onEachFeature: (feature, layer) => {
        const num = feature.properties.numeroBureauVote;

        if (!dejaAjoutes.has(num)) {
          dejaAjoutes.add(num);
          const option = document.createElement('option');
          option.value = num;
          option.textContent = 'Bureau ' + num;
          selectBV.appendChild(option);
        }

        layer.on('click', () => {
          selectBV.value = num;
          setHighlighted(num);
        });
      }
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds());
    applyStyles();
  })
  .catch(err => {
    console.error('Erreur de chargement du GeoJSON :', err);
  });

// ===============================
//  UI styles (sliders/couleurs)
// ===============================
function syncUIValues() {
  maskOpacityVal.textContent   = maskOpacityInp.value + '%';
  othersOpacityVal.textContent = othersOpacityInp.value + '%';
}

function onStyleControlChange() {
  syncUIValues();
  applyStyles();
}

maskOpacityInp.addEventListener('input', onStyleControlChange);
othersOpacityInp.addEventListener('input', onStyleControlChange);
bureauColorInp.addEventListener('input', onStyleControlChange);
maskColorInp.addEventListener('input', onStyleControlChange);

syncUIValues();

// Liste déroulante
selectBV.addEventListener('change', () => {
  const val = selectBV.value;
  if (val) {
    setHighlighted(val);
  } else {
    setHighlighted(null);
  }
});

// ===============================
//  Recherche d'adresse (Nominatim)
// ===============================
function searchAddress() {
  const q = searchInput.value.trim();
  if (!q) return;

  searchStatus.textContent = 'Recherche…';

  fetch(
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(q)
  )
    .then(r => r.json())
    .then(results => {
      if (!results || results.length === 0) {
        searchStatus.textContent = 'Aucune adresse trouvée.';
        return;
      }

      const r = results[0];
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);

      if (searchMarker) {
        map.removeLayer(searchMarker);
      }
      searchMarker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 17);

      if (!geojsonLayer) {
        searchStatus.textContent = 'Adresse trouvée, mais pas de couche bureaux.';
        return;
      }

      const pt = turf.point([lon, lat]);
      let foundNum = null;

      geojsonLayer.eachLayer(layer => {
        const feature = layer.feature;
        if (turf.booleanPointInPolygon(pt, feature)) {
          foundNum = feature.properties.numeroBureauVote;
        }
      });

      if (foundNum !== null) {
        selectBV.value = foundNum;
        setHighlighted(foundNum);
        searchStatus.textContent = 'Adresse dans le bureau ' + foundNum + '.';
      } else {
        searchStatus.textContent = 'Adresse hors des bureaux de vote.';
      }
    })
    .catch(err => {
      console.error(err);
      searchStatus.textContent = 'Erreur de recherche.';
    });
}

searchBtn.addEventListener('click', searchAddress);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    searchAddress();
  }
});

// ===============================
//  Export PNG avec html2canvas
// ===============================
exportBtn.addEventListener('click', () => {
  const mapDiv = document.getElementById('map');

  // Petite indication visuelle
  exportBtn.disabled = true;
  exportBtn.textContent = 'Export...';

  html2canvas(mapDiv, {
    useCORS: true
  }).then(canvas => {
    const link = document.createElement('a');
    const filename = selectedNumero
      ? `bureau-${selectedNumero}.png`
      : 'carte-bureaux.png';

    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    exportBtn.disabled = false;
    exportBtn.textContent = 'Exporter PNG';
  }).catch(err => {
    console.error(err);
    exportBtn.disabled = false;
    exportBtn.textContent = 'Exporter PNG';
    alert("Erreur lors de l'export PNG.");
  });
});
