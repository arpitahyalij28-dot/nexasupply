// Logistics Twin - Core Data Context & Persistence Provider
// Track 3-05: Disruption-Aware Logistics Twin for Regional Supply Networks
// Integrates with twinRepository (LocalAdapter + SupabaseAdapter), Realtime sync,
// offline write queue with auto-replay, optimistic updates, and Zod validation.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { DEMO_DATA } from '../data/mockData';
import { getCityCoords, calculateDistanceKm } from '../data/cities';
import { getDemoNetwork } from '../data/networkDemo.js';
import {
  createSupplier,
  createWarehouse,
  createBuyer,
  createRoute,
  createVehicle,
  createScenarioSettings,
} from '../engine/network.js';
import {
  DEFAULT_DISRUPTIONS,
  applyDisruptionScenario,
} from '../engine/disruptions.js';
import {
  createTwinRepository,
  exportNetworkJson,
  importNetworkJson,
  validateEntity,
} from '../data/twinRepository.js';
import { useAuth } from './AuthContext.jsx';

export const DataContext = createContext(null);

const STORAGE_KEYS = {
  TRUCKS: 'reroute_trucks',
  SHIPMENTS: 'reroute_shipments',
  SELECTED_TRUCK: 'reroute_selected_truck_id',
  SELECTED_SHIPMENT: 'reroute_selected_shipment_id',
  NETWORK: 'logistics_twin_network',
  IS_DEMO: 'logistics_twin_is_demo',
  DISRUPTIONS_CONFIG: 'logistics_twin_disruptions_config',
  SIMULATED_SCENARIO: 'logistics_twin_simulated_scenario',
  OFFLINE_QUEUE: 'logistics_twin_offline_queue',
};

function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getStoredArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`Failed to parse localStorage[${key}]:`, err);
    return [];
  }
}

function getStoredString(key) {
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

export function DataProvider({ children }) {
  // Safe access to Auth context (handles tests where DataProvider might be rendered standalone)
  let auth = {};
  try {
    auth = useAuth() || {};
  } catch {
    auth = { user: null, profile: null, isDemoUser: true };
  }
  const { user = null, profile = null, isDemoUser = true } = auth;

  // Active twin data repository (LocalAdapter or SupabaseAdapter)
  const repository = useMemo(() => {
    return createTwinRepository({ user, profile, forceLocal: isDemoUser });
  }, [user, profile, isDemoUser]);

  // 1. Initial State
  const [trucks, setTrucks] = useState(() => getStoredArray(STORAGE_KEYS.TRUCKS));
  const [shipments, setShipments] = useState(() => getStoredArray(STORAGE_KEYS.SHIPMENTS));
  const [selectedTruckId, setSelectedTruckIdState] = useState(() =>
    getStoredString(STORAGE_KEYS.SELECTED_TRUCK)
  );
  const [selectedShipmentId, setSelectedShipmentIdState] = useState(() =>
    getStoredString(STORAGE_KEYS.SELECTED_SHIPMENT)
  );

  // Logistics Twin Regional Supply Network state (Track 3-05)
  const [network, setNetwork] = useState(() => {
    const stored = getStoredJson(STORAGE_KEYS.NETWORK, null);
    if (stored && Array.isArray(stored.warehouses) && stored.warehouses.length > 0) {
      return stored;
    }
    return getDemoNetwork();
  });

  const [isDemoData, setIsDemoData] = useState(() => {
    const val = localStorage.getItem(STORAGE_KEYS.IS_DEMO);
    return val !== null ? val === 'true' : true;
  });

  // Problem Simulator Disruption Scenario State (Track 3-05)
  const [disruptionsConfig, setDisruptionsConfig] = useState(() => {
    return getStoredJson(STORAGE_KEYS.DISRUPTIONS_CONFIG, DEFAULT_DISRUPTIONS);
  });
  const [scenarioResult, setScenarioResult] = useState(() => {
    return getStoredJson(STORAGE_KEYS.SIMULATED_SCENARIO, null);
  });

  // Offline Sync Queue State
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [offlineQueue, setOfflineQueue] = useState(() => getStoredArray(STORAGE_KEYS.OFFLINE_QUEUE));
  const [concurrencyNotice, setConcurrencyNotice] = useState(null);

  // UI Modal States
  const [isAddTruckOpen, setIsAddTruckOpen] = useState(false);
  const [isAddShipmentOpen, setIsAddShipmentOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [editingShipment, setEditingShipment] = useState(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isDemoPromptOpen, setIsDemoPromptOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Toast Notification Manager
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Online / Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Back online! Syncing queued updates...', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('You are offline. Edits will be saved locally and synced when reconnected.', 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Load Network from Repository on Mount or Repository Swap
  useEffect(() => {
    let isCancelled = false;
    async function initNetwork() {
      try {
        const net = await repository.loadNetwork();
        if (!isCancelled && net) {
          setNetwork(net);
        }
      } catch (err) {
        console.warn('[DataProvider] Initial network load fallback:', err.message);
      }
    }
    initNetwork();
    return () => {
      isCancelled = true;
    };
  }, [repository]);

  // Realtime Subscription with Polling Fallback
  useEffect(() => {
    const unsubscribe = repository.subscribe((event) => {
      if (event.type === 'REALTIME_CHANGE' || event.type === 'POLL_SYNC' || event.type === 'STORAGE_SYNC') {
        repository
          .loadNetwork()
          .then((remoteNet) => {
            if (remoteNet) {
              setNetwork(remoteNet);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [repository]);

  // Offline Queue Worker: Auto-replay queued writes when online
  const replayOfflineQueue = useCallback(async () => {
    if (!isOnline || offlineQueue.length === 0) return;

    const remaining = [...offlineQueue];
    let syncedCount = 0;

    while (remaining.length > 0) {
      const item = remaining[0];
      try {
        if (item.action === 'saveEntity') {
          await repository.saveEntity(item.type, item.entity);
        } else if (item.action === 'deleteEntity') {
          await repository.deleteEntity(item.type, item.id);
        }
        remaining.shift();
        syncedCount++;
      } catch (err) {
        console.error('[OfflineQueue] Sync error on item:', item, err);
        break;
      }
    }

    setOfflineQueue(remaining);
    try {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(remaining));
    } catch {}

    if (syncedCount > 0) {
      showToast(`Successfully synced ${syncedCount} queued change(s) with cloud`, 'success');
    }
  }, [isOnline, offlineQueue, repository, showToast]);

  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      replayOfflineQueue();
    }
  }, [isOnline, offlineQueue.length, replayOfflineQueue]);

  // Offline Write Queuer Helper
  const enqueueOfflineAction = useCallback((actionItem) => {
    setOfflineQueue((prev) => {
      const updated = [...prev, actionItem];
      try {
        localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // 2. LocalStorage Persistence for UI convenience
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.NETWORK, JSON.stringify(network));
    } catch (e) {
      console.warn('LocalStorage save network failed:', e);
    }
  }, [network]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.IS_DEMO, String(isDemoData));
    } catch {}
  }, [isDemoData]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TRUCKS, JSON.stringify(trucks));
    } catch (e) {
      console.warn('LocalStorage save trucks failed:', e);
    }
  }, [trucks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SHIPMENTS, JSON.stringify(shipments));
    } catch (e) {
      console.warn('LocalStorage save shipments failed:', e);
    }
  }, [shipments]);

  useEffect(() => {
    try {
      if (selectedTruckId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_TRUCK, selectedTruckId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_TRUCK);
      }
    } catch {}
  }, [selectedTruckId]);

  useEffect(() => {
    try {
      if (selectedShipmentId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SHIPMENT, selectedShipmentId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_SHIPMENT);
      }
    } catch {}
  }, [selectedShipmentId]);

  useEffect(() => {
    if (trucks.length > 0) {
      if (!selectedTruckId || !trucks.some((t) => t.id === selectedTruckId)) {
        setSelectedTruckIdState(trucks[0].id);
      }
    } else {
      setSelectedTruckIdState(null);
    }
  }, [trucks, selectedTruckId]);

  useEffect(() => {
    if (shipments.length > 0) {
      if (!selectedShipmentId || !shipments.some((s) => s.id === selectedShipmentId)) {
        setSelectedShipmentIdState(shipments[0].id);
      }
    } else {
      setSelectedShipmentIdState(null);
    }
  }, [shipments, selectedShipmentId]);

  const setSelectedTruckId = useCallback((id) => {
    setSelectedTruckIdState(id);
  }, []);

  const setSelectedShipmentId = useCallback((id) => {
    setSelectedShipmentIdState(id);
  }, []);

  // Generic Optimistic Entity Saver with Zod Validation & Rollback
  const performSaveEntity = useCallback(
    async (type, entity, pluralKey) => {
      // 1. Zod Validation
      try {
        validateEntity(type, entity);
      } catch (validationErr) {
        showToast(validationErr.message, 'error');
        throw validationErr;
      }

      // 2. Optimistic React State Update
      const previousState = network;
      setNetwork((prev) => {
        const currentItems = Array.isArray(prev[pluralKey]) ? prev[pluralKey] : [];
        const index = currentItems.findIndex((x) => x.id === entity.id);
        const updatedItems =
          index >= 0
            ? currentItems.map((item, idx) => (idx === index ? { ...item, ...entity } : item))
            : [{ ...entity }, ...currentItems];
        return { ...prev, [pluralKey]: updatedItems };
      });
      setIsDemoData(false);

      // 3. Persistent Save via Repository / Offline Queue
      try {
        if (!isOnline && !isDemoUser) {
          enqueueOfflineAction({ action: 'saveEntity', type, entity });
          showToast(`Saved locally on device (offline). Will sync to cloud.`, 'info');
        } else {
          await repository.saveEntity(type, entity);
          showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} saved`, 'success');
        }
      } catch (err) {
        // Rollback on failure
        setNetwork(previousState);
        showToast(`Failed to save ${type}: ${err.message}`, 'error');
        throw err;
      }
    },
    [network, isOnline, isDemoUser, enqueueOfflineAction, repository, showToast]
  );

  // Generic Optimistic Entity Deleter with Rollback
  const performDeleteEntity = useCallback(
    async (type, id, pluralKey) => {
      const previousState = network;
      setNetwork((prev) => ({
        ...prev,
        [pluralKey]: (prev[pluralKey] || []).filter((item) => item.id !== id),
      }));
      setIsDemoData(false);

      try {
        if (!isOnline && !isDemoUser) {
          enqueueOfflineAction({ action: 'deleteEntity', type, id });
          showToast(`Marked for deletion locally. Will sync to cloud.`, 'info');
        } else {
          await repository.deleteEntity(type, id);
          showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`, 'info');
        }
      } catch (err) {
        setNetwork(previousState);
        showToast(`Failed to delete ${type}: ${err.message}`, 'error');
        throw err;
      }
    },
    [network, isOnline, isDemoUser, enqueueOfflineAction, repository, showToast]
  );

  // Network Entity CRUD Handlers (Track 3-05 Logistics Twin)
  const addSupplier = useCallback(
    (supInput) => {
      const s = createSupplier(supInput);
      performSaveEntity('supplier', s, 'suppliers');
      return s;
    },
    [performSaveEntity]
  );

  const updateSupplier = useCallback(
    (id, patch) => {
      const existing = (network.suppliers || []).find((s) => s.id === id);
      if (existing) {
        const merged = { ...existing, ...patch };
        performSaveEntity('supplier', merged, 'suppliers');
      }
    },
    [network.suppliers, performSaveEntity]
  );

  const deleteSupplier = useCallback(
    (id) => {
      performDeleteEntity('supplier', id, 'suppliers');
    },
    [performDeleteEntity]
  );

  const addWarehouse = useCallback(
    (whInput) => {
      const w = createWarehouse(whInput);
      performSaveEntity('warehouse', w, 'warehouses');
      return w;
    },
    [performSaveEntity]
  );

  const updateWarehouse = useCallback(
    (id, patch) => {
      const existing = (network.warehouses || []).find((w) => w.id === id);
      if (existing) {
        const merged = { ...existing, ...patch };
        performSaveEntity('warehouse', merged, 'warehouses');
      }
    },
    [network.warehouses, performSaveEntity]
  );

  const deleteWarehouse = useCallback(
    (id) => {
      performDeleteEntity('warehouse', id, 'warehouses');
    },
    [performDeleteEntity]
  );

  const addBuyer = useCallback(
    (buyerInput) => {
      const b = createBuyer(buyerInput);
      performSaveEntity('buyer', b, 'buyers');
      return b;
    },
    [performSaveEntity]
  );

  const updateBuyer = useCallback(
    (id, patch) => {
      const existing = (network.buyers || []).find((b) => b.id === id);
      if (existing) {
        const merged = { ...existing, ...patch };
        performSaveEntity('buyer', merged, 'buyers');
      }
    },
    [network.buyers, performSaveEntity]
  );

  const deleteBuyer = useCallback(
    (id) => {
      performDeleteEntity('buyer', id, 'buyers');
    },
    [performDeleteEntity]
  );

  const addRoute = useCallback(
    (routeInput) => {
      const r = createRoute(routeInput);
      performSaveEntity('route', r, 'routes');
      return r;
    },
    [performSaveEntity]
  );

  const updateRoute = useCallback(
    (id, patch) => {
      const existing = (network.routes || []).find((r) => r.id === id);
      if (existing) {
        const merged = { ...existing, ...patch };
        performSaveEntity('route', merged, 'routes');
      }
    },
    [network.routes, performSaveEntity]
  );

  const deleteRoute = useCallback(
    (id) => {
      performDeleteEntity('route', id, 'routes');
    },
    [performDeleteEntity]
  );

  const addVehicle = useCallback(
    (vehInput) => {
      const v = createVehicle(vehInput);
      performSaveEntity('vehicle', v, 'vehicles');
      return v;
    },
    [performSaveEntity]
  );

  const updateVehicle = useCallback(
    (id, patch) => {
      const existing = (network.vehicles || []).find((v) => v.id === id);
      if (existing) {
        const merged = { ...existing, ...patch };
        performSaveEntity('vehicle', merged, 'vehicles');
      }
    },
    [network.vehicles, performSaveEntity]
  );

  const deleteVehicle = useCallback(
    (id) => {
      performDeleteEntity('vehicle', id, 'vehicles');
    },
    [performDeleteEntity]
  );

  const updateScenarioSettings = useCallback(
    (settingsPatch) => {
      setNetwork((prev) => ({
        ...prev,
        settings: {
          ...(prev.settings || createScenarioSettings()),
          ...settingsPatch,
          weights: {
            ...(prev.settings?.weights || {}),
            ...(settingsPatch.weights || {}),
          },
        },
      }));
      showToast(`Scenario settings updated`, 'info');
    },
    [showToast]
  );

  // Disruption Simulation Actions
  const applyDisruptions = useCallback(
    (config) => {
      const res = applyDisruptionScenario(network, config);
      setDisruptionsConfig(config);
      setScenarioResult(res);
      try {
        localStorage.setItem(STORAGE_KEYS.DISRUPTIONS_CONFIG, JSON.stringify(config));
        localStorage.setItem(STORAGE_KEYS.SIMULATED_SCENARIO, JSON.stringify(res));
      } catch {}
      repository.saveScenario(config).catch(() => {});
      showToast('Disruption scenario applied to network copy', 'info');
      return res;
    },
    [network, repository, showToast]
  );

  const clearDisruptions = useCallback(() => {
    setDisruptionsConfig(DEFAULT_DISRUPTIONS);
    setScenarioResult(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.DISRUPTIONS_CONFIG);
      localStorage.removeItem(STORAGE_KEYS.SIMULATED_SCENARIO);
    } catch {}
    showToast('Simulation cleared. Baseline network restored.', 'success');
  }, [showToast]);

  // Network JSON Import & Export
  const exportNetwork = useCallback(() => {
    try {
      const jsonStr = exportNetworkJson(network);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logistics-twin-network-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Network JSON exported successfully', 'success');
      return jsonStr;
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
      return null;
    }
  }, [network, showToast]);

  const importNetwork = useCallback(
    (jsonString) => {
      try {
        const validated = importNetworkJson(jsonString);
        setNetwork(validated);
        setIsDemoData(false);
        showToast('Network JSON successfully imported and validated', 'success');
        return { success: true, data: validated };
      } catch (err) {
        showToast(err.message, 'error');
        return { success: false, error: err.message };
      }
    },
    [showToast]
  );

  // Demo & Reset Handlers
  const loadDemoData = useCallback(
    (mode = 'replace') => {
      const demoTrucks = JSON.parse(JSON.stringify(DEMO_DATA.trucks));
      const demoShipments = JSON.parse(JSON.stringify(DEMO_DATA.shipments));
      const demoNet = getDemoNetwork();

      if (mode === 'merge') {
        setTrucks((curr) => {
          const existingIds = new Set(curr.map((t) => t.id));
          const newOnes = demoTrucks.filter((t) => !existingIds.has(t.id));
          return [...curr, ...newOnes];
        });
        setShipments((curr) => {
          const existingIds = new Set(curr.map((s) => s.id));
          const newOnes = demoShipments.filter((s) => !existingIds.has(s.id));
          return [...curr, ...newOnes];
        });
        setNetwork(demoNet);
        setIsDemoData(true);
        showToast('Demo network and fleet data merged', 'success');
      } else {
        setTrucks(demoTrucks);
        setShipments(demoShipments);
        setSelectedTruckIdState(demoTrucks[0]?.id || 'T101');
        setSelectedShipmentIdState(demoShipments[0]?.id || 'S1');
        setNetwork(demoNet);
        setIsDemoData(true);
        repository.resetDemoNetwork().catch(() => {});
        showToast('Demo Logistics Twin network restored', 'success');
      }
    },
    [repository, showToast]
  );

  const clearAllData = useCallback(() => {
    setTrucks([]);
    setShipments([]);
    setSelectedTruckIdState(null);
    setSelectedShipmentIdState(null);
    setNetwork({
      metadata: null,
      suppliers: [],
      warehouses: [],
      buyers: [],
      routes: [],
      vehicles: [],
      settings: createScenarioSettings(),
    });
    setIsDemoData(false);
    clearDisruptions();

    try {
      localStorage.removeItem(STORAGE_KEYS.TRUCKS);
      localStorage.removeItem(STORAGE_KEYS.SHIPMENTS);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_TRUCK);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_SHIPMENT);
      localStorage.removeItem(STORAGE_KEYS.NETWORK);
      localStorage.removeItem(STORAGE_KEYS.IS_DEMO);
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
      localStorage.removeItem('reroute_demo_trucks');
      localStorage.removeItem('reroute_demo_shipments');
      localStorage.removeItem('reroute_demo_assignments');
    } catch {}

    showToast('All supply network data cleared. Starting fresh.', 'info');
  }, [clearDisruptions, showToast]);

  // Legacy Fleet / Consignments for continuity
  const addTruck = useCallback((truckInput) => {
    const originCoords = truckInput.originCoords || getCityCoords(truckInput.origin);
    const destinationCoords = truckInput.destinationCoords || getCityCoords(truckInput.destination);
    const currentLat = (originCoords[0] + destinationCoords[0]) / 2;
    const currentLng = (originCoords[1] + destinationCoords[1]) / 2;
    const currentCoords = truckInput.currentCoords || [currentLat, currentLng];
    const totalKm = calculateDistanceKm(originCoords, destinationCoords);
    const capacityTons = Number(truckInput.capacityTons || 10);
    const currentLoadTons = Number(truckInput.currentLoadTons ?? capacityTons);

    const newTruck = {
      id: truckInput.id || `T${Date.now().toString().slice(-4)}`,
      regNumber: truckInput.regNumber || `MH-${Math.floor(10 + Math.random() * 40)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(1000 + Math.random() * 9000)}`,
      model: truckInput.model || `${truckInput.vehicleType || '10T Heavy Commercial Vehicle'} (${capacityTons}T)`,
      vehicleType: truckInput.vehicleType || '10T Heavy Commercial Vehicle',
      origin: truckInput.origin || 'Nashik',
      destination: truckInput.destination || 'Mumbai',
      originCoords,
      destinationCoords,
      currentCoords,
      originLat: originCoords[0],
      originLng: originCoords[1],
      destLat: destinationCoords[0],
      destLng: destinationCoords[1],
      currentLat: currentCoords[0],
      currentLng: currentCoords[1],
      currentLocationName: truckInput.currentLocationName || `Transit along ${truckInput.origin} → ${truckInput.destination} Highway`,
      capacityTons,
      maxCapacity: capacityTons * 1000,
      currentLoadTons,
      currentLoad: currentLoadTons * 1000,
      status: truckInput.status || 'In-Transit',
      emptyReturnProbability: Number(truckInput.emptyReturnProbability || 85),
      countdownSeconds: Number(truckInput.countdownSeconds || 2 * 3600 + 15 * 60),
      expectedDeliveryTime: truckInput.expectedDeliveryTime || truckInput.eta || '14:15',
      driverName: truckInput.driverName || 'Driver',
      driverPhone: truckInput.driverPhone || '+91 98000 00000',
      speedKmH: Number(truckInput.speedKmH || 52),
      totalTripKm: totalKm,
      outboundRemainingKm: Math.round(totalKm * 0.45),
      vehicleMileageKmPerL: Number(truckInput.vehicleMileageKmPerL || 4.0),
      fuelPricePerL: Number(truckInput.fuelPricePerL || 95.0),
      emissionFactorKgPerL: Number(truckInput.emissionFactorKgPerL || 2.68),
      createdAt: new Date().toISOString(),
    };

    setTrucks((prev) => [newTruck, ...prev]);
    setSelectedTruckIdState(newTruck.id);
    showToast(`Vehicle ${newTruck.id} added to corridor fleet`, 'success');
    return newTruck;
  }, [showToast]);

  const updateTruck = useCallback((id, patch) => {
    setTrucks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const merged = { ...t, ...patch };
        if (patch.origin) merged.originCoords = getCityCoords(patch.origin);
        if (patch.destination) merged.destinationCoords = getCityCoords(patch.destination);
        if (patch.capacityTons) merged.maxCapacity = Number(patch.capacityTons) * 1000;
        if (patch.currentLoadTons != null) merged.currentLoad = Number(patch.currentLoadTons) * 1000;
        return merged;
      })
    );
    showToast(`Vehicle ${id} specifications updated`, 'info');
  }, [showToast]);

  const deleteTruck = useCallback((id) => {
    setTrucks((prev) => prev.filter((t) => t.id !== id));
    showToast(`Vehicle ${id} removed from fleet`, 'info');
  }, [showToast]);

  const addShipment = useCallback((shipmentInput) => {
    const originCoords = shipmentInput.originCoords || getCityCoords(shipmentInput.origin || shipmentInput.pickupCity);
    const destCoords = shipmentInput.destCoords || getCityCoords(shipmentInput.destination || shipmentInput.dropCity);
    const weightTons = Number(shipmentInput.weightTons || shipmentInput.weight || 8);
    const freightOfferInr = Number(shipmentInput.freightOfferInr || shipmentInput.freightRate || shipmentInput.value || 25000);
    const newId = shipmentInput.id || `S${Date.now().toString().slice(-4)}`;

    const newShipment = {
      id: newId,
      name: shipmentInput.name || `${shipmentInput.origin || shipmentInput.pickupCity} Consignment (${shipmentInput.cargoType || 'General Freight'})`,
      origin: shipmentInput.origin || shipmentInput.pickupCity || 'Mumbai',
      destination: shipmentInput.destination || shipmentInput.dropCity || 'Nashik',
      originCoords,
      destCoords,
      pickupLat: originCoords[0],
      pickupLng: originCoords[1],
      dropLat: destCoords[0],
      dropLng: destCoords[1],
      weightTons,
      cargoWeight: weightTons * 1000,
      cargoType: shipmentInput.cargoType || 'Industrial & FMCG Goods',
      pickupWindowStart: shipmentInput.pickupWindowStart || '14:30',
      pickupWindowEnd: shipmentInput.pickupWindowEnd || '16:00',
      predictedTruckEta: shipmentInput.predictedTruckEta || '14:15',
      etaBufferMinutes: Number(shipmentInput.etaBufferMinutes ?? 15),
      detourKm: Number(shipmentInput.detourKm ?? 8),
      freightOfferInr,
      value: freightOfferInr,
      priority: shipmentInput.priority || 'Standard',
      delayRisk: shipmentInput.delayRisk || 'low',
      delayRiskReason: shipmentInput.delayRiskReason || 'Clear highway connectivity along designated freight corridor',
      status: shipmentInput.status || 'Available',
      requiredVehicleType: shipmentInput.requiredVehicleType || 'Any',
      specialRequirements: shipmentInput.specialRequirements || 'None',
      whyWhyNot: {
        recommendedSummary: `Demand Tender ${newId}: Direct corridor alignment with ₹${freightOfferInr.toLocaleString('en-IN')} freight yield.`,
        reasons: [
          { type: 'check', title: 'Corridor Alignment', description: `${shipmentInput.origin || 'Pickup'} to ${shipmentInput.destination || 'Drop'} vector` },
          { type: 'check', title: 'Payload Matching', description: `${weightTons}t freight ready for loading` },
        ],
      },
      createdAt: new Date().toISOString(),
    };

    setShipments((prev) => [newShipment, ...prev]);
    setSelectedShipmentIdState(newShipment.id);
    showToast(`Load ${newShipment.id} posted to demand pool`, 'success');
    return newShipment;
  }, [showToast]);

  const updateShipment = useCallback((id, patch) => {
    setShipments((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...patch };
        if (patch.origin) merged.originCoords = getCityCoords(patch.origin);
        if (patch.destination) merged.destCoords = getCityCoords(patch.destination);
        if (patch.weightTons) merged.cargoWeight = Number(patch.weightTons) * 1000;
        if (patch.freightOfferInr != null) merged.value = Number(patch.freightOfferInr);
        return merged;
      })
    );
    showToast(`Consignment ${id} updated`, 'info');
  }, [showToast]);

  const deleteShipment = useCallback((id) => {
    setShipments((prev) => prev.filter((s) => s.id !== id));
    showToast(`Consignment ${id} removed`, 'info');
  }, [showToast]);

  const selectedTruck = useMemo(() => {
    return trucks.find((t) => t.id === selectedTruckId) || trucks[0] || null;
  }, [trucks, selectedTruckId]);

  const selectedShipment = useMemo(() => {
    return shipments.find((s) => s.id === selectedShipmentId) || shipments[0] || null;
  }, [shipments, selectedShipmentId]);

  const handleRequestLoadDemo = useCallback(() => {
    if (trucks.length > 0 || shipments.length > 0 || (network.warehouses && network.warehouses.length > 0)) {
      setIsDemoPromptOpen(true);
    } else {
      loadDemoData('replace');
    }
  }, [trucks.length, shipments.length, network.warehouses, loadDemoData]);

  const value = {
    // Repository & Network Digital Twin state (Track 3-05)
    repository,
    network,
    setNetwork,
    isDemoData,
    setIsDemoData,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    addBuyer,
    updateBuyer,
    deleteBuyer,
    addRoute,
    updateRoute,
    deleteRoute,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    updateScenarioSettings,
    exportNetwork,
    importNetwork,

    // Disruption Simulator (Track 3-05)
    disruptionsConfig,
    setDisruptionsConfig,
    scenarioResult,
    isScenarioSimulated: Boolean(scenarioResult?.isDisrupted),
    applyDisruptions,
    clearDisruptions,

    // Offline Queue Telemetry & State
    isOnline,
    offlineQueue,
    hasQueuedWrites: offlineQueue.length > 0,
    offlineQueueCount: offlineQueue.length,
    replayOfflineQueue,
    concurrencyNotice,

    // Legacy Fleet / Consignments for continuity
    trucks,
    shipments,
    selectedTruckId,
    setSelectedTruckId,
    selectedTruck,
    selectedShipmentId,
    setSelectedShipmentId,
    selectedShipment,
    addTruck,
    updateTruck,
    deleteTruck,
    addShipment,
    updateShipment,
    deleteShipment,
    loadDemoData,
    clearAllData,
    handleRequestLoadDemo,

    // Modal & Toast Controls
    isAddTruckOpen,
    setIsAddTruckOpen,
    isAddShipmentOpen,
    setIsAddShipmentOpen,
    editingTruck,
    setEditingTruck,
    editingShipment,
    setEditingShipment,
    isClearConfirmOpen,
    setIsClearConfirmOpen,
    isDemoPromptOpen,
    setIsDemoPromptOpen,
    toasts,
    showToast,
    dismissToast,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
      {/* Offline sync banner / chip if there are queued offline writes */}
      {offlineQueue.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-amber-500 text-slate-900 px-3 py-2 rounded-lg text-xs font-semibold shadow-lg border border-amber-600 animate-pulse"
        >
          <span className="w-2 h-2 rounded-full bg-slate-900 animate-ping" />
          <span>Saved on this device ({offlineQueue.length} queued), will sync</span>
        </div>
      )}
    </DataContext.Provider>
  );
}

export function useDataContext() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
}

export const useData = useDataContext;
export default DataContext;
