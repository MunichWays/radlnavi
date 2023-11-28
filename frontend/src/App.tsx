// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef, MutableRefObject } from "react";
import "./App.css";
import {
  MapContainer as LeafletMap,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  GeoJSON,
} from "react-leaflet";
import { LatLngBounds, LeafletEvent, LeafletMouseEvent, Map as LMap, Icon as LeafletIcon } from "leaflet";
import { throttle, debounce } from "lodash";
import { TextField, IconButton, LinearProgress, Button, createTheme, ThemeProvider, Autocomplete, Tooltip, Switch, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Link, Typography, SwipeableDrawer, Fab } from "@mui/material";
import { CenterFocusWeak, Download, LocationSearching, MenuOpen, PlayArrow, SwapVert } from "@mui/icons-material";
import lineSlice from "@turf/line-slice";
import { point, lineString } from "@turf/helpers";
import length from "@turf/length";
import lineSliceAlong from "@turf/line-slice-along";
import RotatedMarker from './RotatedMarker';
import textInstructions from 'osrm-text-instructions';

const togpx = require("togpx");

const RADLNAVI_GREEN = "#00BCF2";

const SOUTH_WEST = {
  lng: 10.334022,
  lat: 47.286771,
};

const NORTH_EAST = { lat: 49.096737, lng: 13.926551 };

const MAP_BOUNDS = new LatLngBounds(SOUTH_WEST, NORTH_EAST);

const RADLNAVI_THEME = createTheme({
  palette: {
    primary: {
      main: RADLNAVI_GREEN,
    },
  },
});

type LineGeo = Array<{ lat: number, lng: number }>;

interface NavigationStep {
  distance: number;
  maneuver: {
    type: "turn" | "arrive" | "end of road" | "continue",
    modifier: "left" | "slight left" | "straight" | "slight right" | "right",
  };
  geometry: LineGeo;
  description: string;
}

interface NominatimItem {
  display_name: string;
  place_id: number;
  lat: string;
  lon: string;
}

interface RouteMetadata {
  distance: number;
  duration: number;
}

interface QueryItem {
  distance: number;
  start: number;
  end: number;
  surface: string | undefined;
}

async function geocode(value: string): Promise<Array<NominatimItem>> {
  if (value.trim().length > 0) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        value
      )}&format=json&viewbox=${SOUTH_WEST.lng},${SOUTH_WEST.lat},${NORTH_EAST.lng
      },${NORTH_EAST.lat}&bounded=1`
    );
    return response.json();
  } else {
    return [];
  }
}

function displayDistance(distance: number): string {
  if (distance > 1000) {
    return `${Math.floor(distance / 1000)},${Math.round(
      (distance % 1000) / 10
    )} km`;
  } else {
    return `${Math.round(distance)} m`;
  }
}

function download(filename: string, xml: string): void {
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:application/gpx+xml;charset=utf-8," + encodeURIComponent(xml)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

function translateSurface(surface: string): string {
  switch (surface) {
    case "paved":
    case "asphalt":
    case "concrete":
      return "Asphalt";
    case "concrete:lanes":
      return "Asphaltweg";
    case "concrete:plates":
      return "Asphaltplatten";
    case "paving_stones":
      return "Ebener Pflasterstein";
    case "sett":
    case "cobblestone":
      return "Pflasterstein";
    case "unhewn_cobblestone":
      return "Kopfsteinpflaster";
    case "unpaved":
      return "Uneben";
    case "compacted":
      return "Guter Waldweg";
    case "fine_gravel":
    case "pebblestone":
      return "Kies";
    case "gravel":
      return "Schotter";
    case "earth":
    case "dirt":
    case "ground":
      return "Erdboden";
    case "grass":
      return "Gras";
    case "grass_paver":
      return "Betonstein auf Gras";
    case "mud":
      return "Matsch";
    case "sand":
      return "Sand";
    case "woodchips":
      return "Holzschnitzel";
    default:
      return surface;
  }
}

const SURFACE_COLORS = new Map([
  ["Asphalt", "#4682B4"],
  ["Asphaltweg", "#ADD8E6"],
  ["Asphaltplatten", "#B0C4DE"],
  ["Ebener Pflasterstein", "#C0C0C0"],
  ["Pflasterstein", "#A9A9A9"],
  ["Kopfsteinpflaster", "#808080"],
  ["Uneben", "#FFA07A"],
  ["Guter Waldweg", "#006400"],
  ["Kies", "#708090"],
  ["Schotter", "#696969"],
  ["Erdboden", "#CD853F"],
  ["Gras", "#228B22"],
  ["Betonstein auf Gras", "#8FBC8F"],
  ["Matsch", "#BDB76B"],
  ["Sand", "#F4A460"],
  ["Holzschnitzel", "#DEB887"],
]);

function translateLit(lit: string): string {
  if (lit === "no") {
    return "Nicht beleuchtet";
  } else {
    return "Beleuchtet";
  }
}

const LIT_COLORS = new Map([
  ["Beleuchtet", "yellow"],
  ["Nicht beleuchtet", "black"],
]);

const endMarkerIcon = new LeafletIcon({
  iconUrl: "marker-end.svg",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const startMarkerIcon = new LeafletIcon({
  iconUrl: "marker-start.svg",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const userMarkerIcon = new LeafletIcon({
  iconUrl: "marker-user.svg",
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});



function useGeoJsonLayerRefUpdate() {
  const ref: MutableRefObject<any> = useRef(null);
  const setRef = useCallback((node: any) => {
    if (node) {
      setTimeout(() => {
        node.bringToBack();
      }, 0);
    }
    ref.current = node;
  }, []);

  return [setRef]
}

function App() {
  const [startSuggestions, setStartSuggestions] = useState<
    Array<NominatimItem>
  >(new Array<NominatimItem>());
  const [endSuggestions, setEndSuggestions] = useState<Array<NominatimItem>>(
    new Array<NominatimItem>()
  );
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [startPosition, setStartPosition] = useState<NominatimItem | null>(
    null
  );
  const [endPosition, setEndPosition] = useState<NominatimItem | null>(null);
  const [route, setRoute] = useState<null | any>();
  const [surfacesOnRoute, setSurfacesOnRoute] = useState<null | Map<
    string,
    number
  >>(null);
  const [illuminatedOnRoute, setIlluminatedOnRoute] = useState<null | Map<
    string,
    number
  >>(null);
  const [illuminatedPaths, setIlluminatedPaths] = useState<null | Map<string, Array<Array<{ lat: number, lon: number }>>>>(null);
  const [surfacePaths, setSurfacePaths] = useState<null | Map<string, Array<Array<{ lat: number, lon: number }>>>>(null);
  const [navigationPath, setNavigationPath] = useState<null | Array<{ lat: number, lng: number }> | null>(null);
  const [routeMetadata, setRouteMetadata] = useState<RouteMetadata | null>(
    null
  );
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    left: number;
    top: number;
    lat: number;
    lng: number;
  } | null>(null);
  const [menuMinimized, setMenuMinimized] = useState<boolean>(false);
  const [hightlightLit, setHightlightLit] = useState<string | null>(null);
  const [hightlightSurface, setHightlightSurface] = useState<string | null>(null);
  const [map, setMap] = useState<LMap | null>(null);
  const [showMunichways, setShowMunichways] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [geoJsonLayerRef] = useGeoJsonLayerRefUpdate();
  const [showAbout, setShowAbout] = useState(false);
  const [showImpressum, setShowImpressum] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [geolocationWathId, setGeolocationWatchId] = useState<number | null>(null);
  const [userPosition, setUserPosition] = useState<null | { lat: number, lng: number, speed: number | null, heading: number | null }>(null);
  const [snappedUserPosition, setSnappedUserPosition] = useState<null | { lat: number, lng: number }>(null);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [nextNavigationStep, setNextNavigationStep] = useState<NavigationStep>(null);
  const [lineToRoute, setLineToRoute] = useState<LineGeo | null>(null);

  useEffect(() => {
    if (map && showMunichways && !geoJsonData) {
      fetch("munichways.json").then(response => response.json()).then((json) => {
        setGeoJsonData(json);
      });
    }
  }, [map, geoJsonData, showMunichways]);

  const autocompleteStart = useCallback(
    debounce((value: string) => {
      geocode(value).then(setStartSuggestions);
    }, 1000),
    []
  );

  const autocompleteEnd = useCallback(
    debounce((value: string) => {
      geocode(value).then(setEndSuggestions);
    }, 1000),
    []
  );

  useEffect(() => autocompleteStart(startValue), [startValue]);
  useEffect(() => autocompleteEnd(endValue), [endValue]);

  useEffect(() => {
    if (isNavigating && route && userPosition && routeMetadata) {
      map?.setView({ lat: userPosition.lat, lng: userPosition.lng }, 20 - Math.min(5, (userPosition.speed || 0) / 2), { animate: true, duration: 1 });
      const line = lineString(route.geometry.coordinates);
      const navigationRoute = lineSlice(point([userPosition.lng, userPosition.lat]), point(route.geometry.coordinates[route.geometry.coordinates.length - 1]), line);
      setNavigationPath(navigationRoute.geometry.coordinates.map((pos) => ({ lat: pos[1], lng: pos[0] })));
      const distanceToTravel = length(navigationRoute, { units: "meters" });
      const distanceTravelled = routeMetadata.distance - distanceToTravel;

      // snap user position to route
      const fromUserToRoute = lineString([[userPosition.lng, userPosition.lat], navigationRoute.geometry.coordinates[0]]);
      const distanceToRoute = length(fromUserToRoute, { units: "meters" });
      if (distanceToRoute < 15) {
        setSnappedUserPosition({
          lat: navigationRoute.geometry.coordinates[0][1],
          lng: navigationRoute.geometry.coordinates[0][0],
        });
        setLineToRoute(null);
      } else {
        setSnappedUserPosition({
          ...userPosition,
        });
        setLineToRoute(fromUserToRoute.geometry?.coordinates?.map(coord => ({ lat: coord[1], lng: coord[0] })));
      }

      let upcomingStep = null;
      const routeSteps = route.legs[0].steps;
      let travelled = distanceTravelled;
      console.log("steps:", routeSteps);
      for (const step of routeSteps) {
        if (travelled < 0) {
          upcomingStep = step;
          break;
        }
        travelled -= step.distance;
      }
      if (upcomingStep != null) {
        const nextStepDistanceFromStart = distanceTravelled + Math.abs(travelled);
        setNextNavigationStep({
          distance: Math.abs(travelled),
          maneuver: upcomingStep?.maneuver,
          description: textInstructions("v5").compile("de", upcomingStep),
          geometry: lineSliceAlong(
            line,
            nextStepDistanceFromStart - 15,
            nextStepDistanceFromStart + 15,
            { units: "meters" },
          ).geometry?.coordinates?.map(coord => ({ lat: coord[1], lng: coord[0] })),
        });
      }
    }
  }, [userPosition, route, isNavigating, routeMetadata])

  const dragStartPosition = throttle((e: LeafletEvent) => {
    const pos = e.target?.getLatLng();
    if (pos) {
      routeFromHere(pos);
    }
  }, 500);

  const dragEndPosition = throttle((e: LeafletEvent) => {
    const pos = e.target?.getLatLng();
    if (pos) {
      routeToHere(pos);
    }
  }, 500);

  const calculateRouteSurface = useCallback(
    debounce((results: any) => {
      const nodes = results.routes[0].legs[0].annotation.nodes;
      const distances = results.routes[0].legs[0].annotation.distance;

      const queryItems: Array<QueryItem> = nodes
        .map((n: number, i: number) => {
          if (i < nodes.length - 1) {
            return {
              distance: distances[i],
              start: n,
              end: nodes[i + 1],
            };
          } else {
            return null;
          }
        })
        .filter((i: QueryItem | null) => i !== null);

      const queryData = `[out:json][timeout:25];node(id:${nodes.join(",")});way(bn);(._;>;);out;`;

      fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "form/multipart" },
        body: `data=${encodeURIComponent(queryData)}`,
      })
        .then((response) => response.json())
        .then((answer) => {
          const surfaces: Map<string, number> = new Map();
          const illuminated: Map<string, number> = new Map();

          const ways = answer.elements.filter((e: any) => e.type === 'way');
          const nodesById = Object.fromEntries(answer.elements.filter((e: any) => e.type === 'node').map((node: any) => [node.id, node]));
          const illuminatedPaths = new Map<string, Array<Array<{ lat: number, lon: number }>>>();
          const surfacePaths = new Map<string, Array<Array<{ lat: number, lon: number }>>>();

          for (const item of queryItems) {
            const wayContainingNodes = ways.find((way: any) => way.nodes.includes(item.start) && way.nodes.includes(item.end));
            const surface = wayContainingNodes?.tags?.surface === undefined ? "Unbekannt" : translateSurface(wayContainingNodes.tags.surface) || "Unbekannt";
            const lit = wayContainingNodes?.tags?.lit === undefined ? "Unbekannt" : translateLit(wayContainingNodes.tags.lit) || "Unbekannt";
            const startNode = nodesById[item.start];
            const endNode = nodesById[item.end];
            const path = [startNode, endNode];

            if (illuminatedPaths.has(lit)) {
              const lastPoint = illuminatedPaths.get(lit)?.slice(-1)?.[0]?.slice(-1)?.[0];
              if (lastPoint !== undefined && lastPoint.lat === startNode.lat && lastPoint.lon === startNode.lon) {
                illuminatedPaths.get(lit)?.slice(-1)?.[0].push(endNode);
              } else {
                illuminatedPaths.get(lit)?.push(path);
              }
            } else {
              illuminatedPaths.set(lit, [path]);
            }

            if (surfacePaths.has(surface)) {
              const lastPoint = surfacePaths.get(surface)?.slice(-1)?.[0]?.slice(-1)?.[0];
              if (lastPoint !== undefined && lastPoint.lat === startNode.lat && lastPoint.lon === startNode.lon) {
                surfacePaths.get(surface)?.slice(-1)?.[0].push(endNode);
              } else {
                surfacePaths.get(surface)?.push(path);
              }
            } else {
              surfacePaths.set(surface, [path]);
            }

            if (surfaces.has(surface)) {
              const current = surfaces.get(surface) || 0;
              surfaces.set(surface, current + item.distance);
            } else {
              surfaces.set(surface, item.distance);
            }

            if (illuminated.has(lit)) {
              const current = illuminated.get(lit) || 0;
              illuminated.set(lit, current + item.distance);
            } else {
              illuminated.set(lit, item.distance);
            }
          }
          setIlluminatedPaths(illuminatedPaths);
          setSurfacePaths(surfacePaths);
          setSurfacesOnRoute(surfaces);
          setIlluminatedOnRoute(illuminated);
        });
    }, 1000),
    []
  );

  function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
      ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
  }

  function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
  }

  const calculateRoute = useCallback(
    throttle((startPosition, endPosition) => {
      setIlluminatedPaths(null);
      setSurfacePaths(null);
      setNavigationPath(null);
      setNextNavigationStep(null);
      setUserPosition(null);
      setSurfacesOnRoute(null);
      setIlluminatedOnRoute(null);
      if (startPosition && endPosition) {
        fetch(
          `${process.env.REACT_APP_OSRM_BACKEND}/route/v1/bike/${startPosition.lon},${startPosition.lat}%3b${endPosition.lon},${endPosition.lat
          }%3Foverview=full&alternatives=true&steps=true&geometries=geojson&annotations=true`
        )
          .then((response) => response.json())
          .then((results) => {
            console.log(results);
            setRoute(results.routes[0]);
            setRouteMetadata({
              distance: results.routes[0].distance as number,
              duration: results.routes[0].duration as number,
            });
            calculateRouteSurface(results);
          });
      }
    }, 500),
    [startPosition, endPosition]
  );

  const exportGpx = useCallback(() => {
    if (route.geometry != null) {
      const routeGpx = togpx(route.geometry);
      download("route.gpx", routeGpx);
    }
  }, [route]);

  const openContextMenu = useCallback((e: LeafletMouseEvent) => {
    e.originalEvent.preventDefault();
    setContextMenuPosition({
      left: e.originalEvent.clientX,
      top: e.originalEvent.clientY,
      lat: e.latlng.lat,
      lng: e.latlng.lng,
    });
    console.log(
      "clicked on point",
      e.latlng,
      e.originalEvent.clientX,
      e.originalEvent.clientY
    );
    return false;
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuMinimized(!menuMinimized);
  }, [menuMinimized]);

  const startNavigation = useCallback(() => {
    setMenuMinimized(true);
    setIsNavigating(true);
  }, [])

  useEffect(() => {
    if ("geolocation" in navigator) {
      if (isNavigating) {
        if (geolocationWathId == null) {
          map?.setView({ lat: route.geometry.coordinates[0][1], lng: route.geometry.coordinates[0][0] }, 20, { animate: true });
          const watchId = navigator.geolocation.watchPosition((position) => {
            setUserPosition({ lat: position.coords.latitude, lng: position.coords.longitude, speed: position.coords.speed, heading: position.coords.heading });
          }, (error) => {
            console.error(error);
          }, {
            enableHighAccuracy: true,
            maximumAge: 0,
          });
          setGeolocationWatchId(watchId);
        }
      } else {
        if (geolocationWathId) {
          navigator.geolocation.clearWatch(geolocationWathId);
          setGeolocationWatchId(null);
        }
      }
    }

    if ("wakeLock" in navigator) {
      if (isNavigating) {
        navigator.wakeLock.request().then(value => setWakeLock(value))
      } else {
        wakeLock?.release().then(() => setWakeLock(null));
      }
    }
  }, [isNavigating, geolocationWathId, route])

  const routeFromHere = useCallback(
    (position: { lat: number; lng: number }) => {
      const item = {
        display_name: `[${position.lat.toPrecision(
          8
        )}; ${position.lng.toPrecision(8)}]`,
        place_id: 1,
        lat: position.lat.toString() || "0",
        lon: position.lng.toString() || "0",
      };
      setStartSuggestions([item]);
      setStartPosition(item);
      closeContextMenu();
    },
    []
  );

  const routeToHere = useCallback((position: { lat: number; lng: number }) => {
    const item = {
      display_name: `[${position.lat.toPrecision(
        8
      )}; ${position.lng.toPrecision(8)}]`,
      place_id: 2,
      lat: position.lat.toString() || "0",
      lon: position.lng.toString() || "0",
    };
    setEndSuggestions([item]);
    setEndPosition(item);
    closeContextMenu();
  }, []);

  useEffect(() => {
    if (map != null) {
      map.on("contextmenu", (e: LeafletMouseEvent) => {
        openContextMenu(e);
      });
      map.on("movestart", () => closeContextMenu());
      map.on("click", () => closeContextMenu());
      map.on("mouseover", () => {
        setHightlightSurface(null);
        setHightlightLit(null);
      });
    }
  }, [map, closeContextMenu, openContextMenu]);

  useEffect(() => calculateRoute(startPosition, endPosition), [
    startPosition,
    endPosition,
  ]);

  let surfacesElement = null;
  let illuminatedElement = null;

  if (startPosition != null && endPosition != null && surfacesOnRoute != null) {
    surfacesElement =
      <div style={{ display: 'flex', height: '30px' }}>{
        [...surfacesOnRoute.entries()]
          .sort((a, b) => a[1] - b[1])
          .map(([k, v]) => <div key={k} onTouchStart={() => setHightlightSurface(k)} onTouchEnd={() => setHightlightSurface(null)} onMouseOver={() => setHightlightSurface(k)} onMouseOut={() => setHightlightSurface(null)} id={k} style={{ background: SURFACE_COLORS.get(k) || 'gray', flexGrow: v / ([...surfacesOnRoute.values()].reduce((p, v) => p + v, 0)) * 100 }}></div>)
          .map((element) => element.key === hightlightSurface ? <Tooltip arrow placement="top" open={hightlightSurface != null} title={hightlightSurface}>{element}</Tooltip> : element)
          .reverse()
      }</div>;
  }

  if (startPosition != null && endPosition != null && illuminatedOnRoute != null) {
    illuminatedElement =
      <div style={{ display: 'flex', height: '30px', marginTop: 0 }}>{
        [...illuminatedOnRoute.entries()]
          .sort((a, b) => a[1] - b[1])
          .map(([k, v]) => <div key={k} onTouchStart={() => setHightlightLit(k)} onTouchEnd={() => setHightlightLit(null)} onMouseOver={() => setHightlightLit(k)} onMouseOut={() => setHightlightLit(null)} id={k} style={{ background: LIT_COLORS.get(k) || 'gray', flexGrow: v / ([...illuminatedOnRoute.values()].reduce((p, v) => p + v, 0)) * 100 }}></div>)
          .map((element) => element.key === hightlightLit ? <Tooltip arrow placement="top" open={hightlightLit != null} title={hightlightLit}>{element}</Tooltip> : element)
          .reverse()
      }</div>;
  }

  const routeMetaElement = routeMetadata ? (
    <div id="route-metadata">
      <div id="route-header" className="route-meta-heading">
        Berechnete Route
      </div>
      <div id="route-duration" className="route-meta">
        <div id="route-duration-key">Geschätzte Dauer</div>
        <div id="route-duration-value">
          {routeMetadata
            ? `${Math.round(routeMetadata.duration / 60)} Minuten`
            : "unbekannt"}
        </div>
      </div>
      <div id="route-distance" className="route-meta">
        <div id="route-distance-key">Gesamtdistanz</div>
        <div id="route-distance-value">
          {routeMetadata
            ? displayDistance(routeMetadata.distance)
            : "unbekannt"}
        </div>
      </div>
    </div>
  ) : null;

  const drawRoute = (route: any) => {
    const coords = route.geometry.coordinates.map(
      (tuple: Array<Array<number>>) => ({
        lat: tuple[1],
        lng: tuple[0],
      })
    );
    return <Polyline positions={coords} color="#005180"></Polyline>;
  };

  const drawIlluminated = () => {
    return illuminatedPaths == null ? [] : [...illuminatedPaths.entries()]
      .filter(([key, _]) => key === hightlightLit)
      .map(([key, entry]) => entry.map(
        (litPath) => <React.Fragment>
          <Polyline key={`${key}-border`} color={'white'} weight={9} positions={
            litPath.map(
              (point) => ({ lat: point.lat, lng: point.lon })
            )
          }></Polyline>
          <Polyline key={`${key}-fill`} color={LIT_COLORS.get(key) || 'gray'} weight={6} positions={
            litPath.map(
              (point) => ({ lat: point.lat, lng: point.lon })
            )
          }></Polyline>
        </React.Fragment>
      )
      );
  };

  const drawSurfaces = () => {
    return surfacePaths == null ? [] : [...surfacePaths.entries()]
      .filter(([key, _]) => key === hightlightSurface)
      .map(([key, entry]) => entry.map(
        (surfacePath) => <React.Fragment>
          <Polyline key={`${key}-border`} color={'white'} weight={9} positions={
            surfacePath.map(
              (point) => ({ lat: point.lat, lng: point.lon })
            )
          }></Polyline>
          <Polyline key={`${key}-fill`} color={SURFACE_COLORS.get(key) || 'gray'} weight={6} positions={
            surfacePath.map(
              (point) => ({ lat: point.lat, lng: point.lon })
            )
          }></Polyline>
        </React.Fragment>
      )
      );
  };

  const goToMenu = useCallback(() => {
    setMenuMinimized(false);
    setIsNavigating(false);
  }, []);

  document.onresize = () => {
    if (map != null) {
      map.invalidateSize();
    }
  }

  return (
    <ThemeProvider theme={RADLNAVI_THEME}>
      <div className="App" onResize={() => {
        if (map != null) {
          map.invalidateSize();
        }
      }}>
        {contextMenuPosition !== null ? (
          <div
            id="menu"
            style={{
              left: `${contextMenuPosition.left}px`,
              top: `${contextMenuPosition.top}px`,
            }}
          >
            <Button
              color="primary"
              onClick={() => routeFromHere(contextMenuPosition)}
            >
              Route von hier
            </Button>
            <Button
              color="primary"
              onClick={() => routeToHere(contextMenuPosition)}
            >
              Route zu dieser Position
            </Button>
          </div>
        ) : null}

        {menuMinimized ?
          <Fab color="primary" onClick={() => goToMenu()} style={{ position: "absolute", top: 15, left: 15, zIndex: 1 }}>
            <MenuOpen sx={{ transform: "scaleX(-1);" }} />
          </Fab> : null}

        <SwipeableDrawer sx={{ ".MuiDrawer-paper": { overflow: "visible" } }} variant="persistent" anchor="left" open={!menuMinimized} onClose={() => setMenuMinimized(true)} onOpen={() => setMenuMinimized(false)}>

          <img src="logo.png" width="320" height="80" alt="RadlNavi Logo" style={{ margin: "10px auto" }}></img>
          <div style={{ margin: "-7px 5px 7px 5px", display: "flex", alignItems: "center", flexDirection: "column" }}>
            <Typography style={{ fontSize: "0.7rem" }}>Sichere Fahrradnavigation für München und Umgebung</Typography>
            <Link style={{ fontSize: "0.7rem", cursor: "pointer" }} onClick={() => setShowAbout(true)}>Wie macht RadlNavi meine Fahrradfahrt sicherer?</Link>
          </div>
          <div className="routing" style={{ flex: 1 }}>
            <div style={{ display: 'flex', marginTop: 20 }}>
              <Autocomplete
                id="start"
                filterOptions={(x) => x}
                value={startPosition}
                onInputChange={(_props, newValue: string, _reason) => {
                  console.log("set value", newValue);
                  setStartValue(newValue);
                }}
                clearOnBlur={false}
                onChange={(e, newValue) => {
                  console.log("selected", newValue);
                  setStartPosition(newValue);
                  if (newValue == null) {
                    setRoute(null);
                    setRouteMetadata(null);
                  }
                }}
                options={startSuggestions}
                getOptionLabel={(option: NominatimItem | null) =>
                  !option ? "" : option.display_name
                }
                style={{ width: 300 }}
                noOptionsText={"Für Vorschläge Adresse eingeben ..."}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Startposition"
                    variant="outlined"
                    fullWidth
                  />
                )}
              />
              <Tooltip title="Aktuelle Position ermitteln und als Start setzen" arrow>
                <IconButton color="primary" onClick={() => navigator.geolocation.getCurrentPosition((loc) => setStartPosition({
                  display_name: "Ermittelter Standort",
                  place_id: 1,
                  lat: loc.coords.latitude + "",
                  lon: loc.coords.longitude + "",
                }))}><LocationSearching /></IconButton>
              </Tooltip>
            </div>
            <div style={{
              display: 'flex',
            }}>
              <Autocomplete
                id="end"
                filterOptions={(x) => x}
                value={endPosition}
                clearOnBlur={false}
                onInputChange={(_props, newValue: string, _reason) => {
                  console.log("set value", newValue);
                  setEndValue(newValue);
                }}
                onChange={(e, newValue) => {
                  console.log("selected", newValue);
                  setEndPosition(newValue);
                  if (newValue == null) {
                    setRoute(null);
                    setRouteMetadata(null);
                  }
                }}
                options={endSuggestions}
                getOptionLabel={(option: NominatimItem | null) =>
                  !option ? "" : option.display_name
                }
                style={{ width: 300 }}
                noOptionsText={"Für Vorschläge Adresse eingeben ..."}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Ziel"
                    variant="outlined"
                    fullWidth
                  />
                )}
              />
              <Tooltip title="Route umkehren" placement="top" arrow>
                <IconButton disabled={startPosition == null || endPosition == null} color="primary" onClick={() => {
                  const tmp = startPosition;
                  setStartPosition(endPosition);
                  setEndPosition(tmp);
                }}><SwapVert></SwapVert></IconButton>
              </Tooltip>
            </div>
            {routeMetaElement}
            {route && map ? <Button
              variant="contained"
              color="primary"
              style={{ margin: "0 10px" }}
              startIcon={<CenterFocusWeak />}
              onClick={() => {
                setMenuMinimized(true);
                map.fitBounds(new LatLngBounds(route.geometry.coordinates.map((c: any) => {
                  return [c[1], c[0]];
                })));
              }}>Route anzeigen</Button> : null}
            {route != null ?
              <Button
                style={{ margin: "10px 10px 0 10px" }}
                variant="contained"
                color="primary"
                onClick={() => startNavigation()}
                disabled={route == null}
                startIcon={<PlayArrow />}
              >
                Navigation starten
              </Button>
              : null}
            {startPosition != null && endPosition != null && (surfacesElement == null || illuminatedElement == null || routeMetaElement == null) ? <LinearProgress sx={{ height: 10, borderRadius: 4, margin: "10px" }} /> : null}
            {surfacesElement}
            {illuminatedElement}
            {route != null ?
              <Button
                style={{ margin: "0 10px" }}
                variant="contained"
                color="primary"
                onClick={() => exportGpx()}
                disabled={route == null}
                startIcon={<Download />}
              >
                GPX herunterladen
              </Button>
              : null}
            <div style={{ flexGrow: 1 }}></div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 5 }}>
              <FormControlLabel control={<Switch value={showMunichways} onChange={(_, checked) => setShowMunichways(checked)} />} label="MunichWays Bewertungen" />
            </div>
            <div style={{fontSize: '0.75rem', margin: "0 auto 15px auto", textAlign: 'center' }}>
              <Link style={{cursor: "pointer" }} onClick={() => setShowImpressum(true)}>Impressum und Datenschutzerklärung</Link><br />
              <div style={{ padding: 2 }}></div>
              <Link style={{cursor: "pointer", fontWeight: 'bold' }} onClick={() => window.open(`https://github.com/MunichWays/radlnavi/releases/tag/${process.env.REACT_APP_VERSION || "v1"}`, "_blank")}>Das ist neu in RadlNavi {process.env.REACT_APP_VERSION || "v1"}</Link>
            </div>
          </div>
        </SwipeableDrawer>

        {isNavigating && nextNavigationStep && nextNavigationStep ? <div style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 20,
          zIndex: 1000,
          background: "#00BCF2",
          padding: 10,
          borderRadius: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
        }}>

          {nextNavigationStep.maneuver.type != "arrive" && nextNavigationStep.maneuver?.modifier == null ? <div style={{ flexGrow: 1 }}></div> :
            <div style={{
              backgroundImage: `url(./${nextNavigationStep.maneuver?.type == "arrive" ? "arrive" : "maneuver_" + nextNavigationStep.maneuver.modifier.replaceAll(" ", "_")}.svg)`,
              backgroundRepeat: "no-repeat",
              flexGrow: 1,
              minWidth: 70,
              backgroundPositionY: "center",
            }}>
            </div>}

          <div style={{ textAlign: "left", flexGrow: 1 }}>
            <span style={{ fontSize: "2rem" }}>{Math.round(nextNavigationStep.distance / 10) * 10}m</span><br />
            <i>{nextNavigationStep.description}</i>
          </div>
        </div> : null}

        <LeafletMap
          className="map"
          center={[48.134991, 11.584225]}
          zoom={13}
          zoomAnimation={true}
          zoomControl={false}
          maxBounds={MAP_BOUNDS}
          ref={setMap}
        >
          <TileLayer
            attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {startPosition != null ? (
            <Marker
              icon={startMarkerIcon}
              draggable={true}
              eventHandlers={{
                drag: (e) => dragStartPosition(e),
              }}
              position={[
                parseFloat(startPosition.lat),
                parseFloat(startPosition.lon),
              ]}
            >
              <Popup>{startPosition.display_name}</Popup>
            </Marker>
          ) : null}
          {endPosition != null ? (
            <Marker
              icon={endMarkerIcon}
              draggable={true}
              eventHandlers={{
                drag: (e) => dragEndPosition(e),
              }}
              position={[
                parseFloat(endPosition.lat),
                parseFloat(endPosition.lon),
              ]}
            >
              <Popup>{endPosition.display_name}</Popup>
            </Marker>
          ) : null}
          {userPosition != null && route != null ? (
            <RotatedMarker
              icon={userMarkerIcon}
              draggable={false}
              position={[
                snappedUserPosition?.lat || userPosition.lat,
                snappedUserPosition?.lng || userPosition.lng,
              ]}
              rotationAngle={userPosition.heading || 0}
              rotationOrigin={"center center"}
            ></RotatedMarker>
          ) : null}
          {route != null && startPosition != null && endPosition != null
            ? drawRoute(route)
            : null}
          {illuminatedPaths != null && startPosition != null && endPosition != null ? drawIlluminated() : null}
          {surfacePaths != null && startPosition != null && endPosition != null ? drawSurfaces() : null}
          {navigationPath == null || route == null ? null :
            <Polyline color="#00BCF2" weight={6} positions={
              navigationPath
            }></Polyline>
          }
          {navigationPath == null || route == null || nextNavigationStep?.geometry == null ? null :
            <Polyline color="#008CB4" weight={8} positions={
              nextNavigationStep.geometry
            }></Polyline>
          }
          {navigationPath == null || route == null || lineToRoute == null ? null :
            <Polyline color="red" dashArray="7 7" weight={4} positions={
              lineToRoute
            }></Polyline>
          }
          {geoJsonData != null && showMunichways ? <GeoJSON ref={geoJsonLayerRef} data={geoJsonData as any} onEachFeature={(feature, layer: any) => {
            var layerType = layer.feature.geometry.type;
            if (layerType == 'LineString') {
              if (typeof layer.setStyle == "function") {
                layer.setStyle({ weight: 5, color: feature.properties.color, opacity: 0.5 });
              }
            }
          }} /> : null}
        </LeafletMap>
      </div>

      {navigationPath == null || route == null || lineToRoute == null ? null :
        <Button
          variant="contained"
          color="warning"
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)"
          }} onClick={() => routeFromHere(lineToRoute[0])}>Route neu berechnen</Button>
      }

      <Dialog open={showAbout}>
        <DialogTitle>Über RadlNavi</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Während bei konventionellen Navigationsanwendungen (bspw. Google Maps) die schnellste Route für den Radverkehr berechnet wird, berücksichtigt RadlNavi explizit auch die Bedürfnisse von Radfahrern.<br />
            Dabei liegt der Fokus auf der Sicherheit und dem Komfort der Route.<br />
            RadlNavi verwendet dazu Streckenbewertungen, welche durch die <a href="https://www.munichways.de">MunichWays</a> Initiative erfasst wurden.<br />
            In die Bewertungen fließen unter anderem ein, ob es einen baulich getrennten Radweg gibt, wie breit dieser ist, wie die generelle Verkehrsdichte ist, wie viele Straßenmündungen auf der Route liegen und ob diese übersichtlich (oder eben gefährlich) gestaltet sind.<br />
            Die Bewertungen können durch einen Schalter auch in der Karte als farbige Linien dargestellt werden, wobei die Farben von Grün (genütlich) über Gelb und Rot bis Schwarz (stressig) reichen.<br />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAbout(false)}>Schließen</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showImpressum}>
        <DialogTitle>Impressum</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <h4>Verantwortlich für den Inhalt</h4>
            Florian Schnell<br />
            Ansprengerstraße 2<br />
            80803 München<br />
            floschnell [at] gmail.com<br />
            <h4>Datenschutz</h4>
            Die Anwendung verwendet Leaflet und OpenStreetMap.<br />
            Die Anwendung verwendet Google Fonts.<br />
            Die Anwendung speichert vorrübergehend IP Adressen in Log-Dateien.<br />
            Die Anwendung verwendet <b>keine</b> Cookies.<br />
            Die Anwendung verwendet <b>keine</b> Analyse-Tools.<br />
            Die Anwendung verwendet <b>keine</b> Werbung.<br />
            Die Anwendung verwendet <b>keine</b> Social-Media-Plugins.<br />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowImpressum(false)}>Schließen</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider >
  );
}

export default App;
