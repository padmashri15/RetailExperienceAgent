import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Palette, Plus, RotateCw } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Product } from "../../shared/types";
import { trackAnalyticsEvent } from "../lib/api";
import type { AgentActivityInput } from "../lib/agentActivity";
import { IconButton } from "./IconButton";

type ProductModelKind = "shoe" | "trail_shoe" | "slide" | "jacket" | "apparel" | "vest" | "bag";
type SurfaceMode = "matte" | "weather" | "reflective";

interface Product3DViewerProps {
  onAgentActivity: (activity: AgentActivityInput) => void;
  product: Product;
}

const colorways = [
  { label: "Graphite", primary: "#2F3A4F", secondary: "#E8EEF2", accent: "#C8962E", sole: "#111827" },
  { label: "Forest", primary: "#1D6B57", secondary: "#BFD7CE", accent: "#D7634F", sole: "#172033" },
  { label: "Coral", primary: "#D7634F", secondary: "#F6D4CD", accent: "#5867B3", sole: "#242A38" },
  { label: "Iris", primary: "#5867B3", secondary: "#DCE2FF", accent: "#1D6B57", sole: "#172033" }
] as const;

const surfaceModes: Array<{ label: string; value: SurfaceMode }> = [
  { label: "Matte", value: "matte" },
  { label: "Weather", value: "weather" },
  { label: "Reflective", value: "reflective" }
];

const MODEL_VIEWPORT_HEIGHT_RATIO = 0.735;
const MODEL_MIN_USER_SCALE = 0.72;
const MODEL_MAX_USER_SCALE = 1.42;

export function Product3DViewer({ onAgentActivity, product }: Product3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const modelScaleRef = useRef(1);
  const refitSceneRef = useRef<(() => void) | null>(null);
  const [colorwayIndex, setColorwayIndex] = useState(0);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("matte");
  const [modelScale, setModelScale] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const modelKind = useMemo(() => getProductModelKind(product), [product]);
  const colorway = colorways[colorwayIndex];

  useEffect(() => {
    onAgentActivity({
      agent: "3D Product Visualization Agent",
      action: `${product.name} rendered in 3D`,
      detail: "Creates an interactive Three.js product model from the selected retail item with material, color, rotation, and zoom controls.",
      tone: "pine"
    });

    trackAnalyticsEvent({
      eventName: "product_3d_view",
      productIds: [product.id],
      metadata: {
        category: product.category,
        modelKind,
        product_categories: [product.category],
        product_names: [product.name]
      }
    }).catch(() => undefined);
  }, [modelKind, onAgentActivity, product.category, product.id, product.name]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#eef3f8", 7, 12);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(3.2, 2.1, 6.2);
    camera.lookAt(0, 0, 0);

    const hemiLight = new THREE.HemisphereLight("#ffffff", "#b9c4cf", 2.5);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight("#ffffff", 3.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(colorway.accent, 1.4);
    rimLight.position.set(-5, 2, -3);
    scene.add(rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.85, 64),
      new THREE.MeshStandardMaterial({ color: "#dfe7ee", roughness: 0.82, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.25;
    ground.receiveShadow = true;
    scene.add(ground);

    let isMounted = true;
    let productModel: THREE.Group | undefined;
    setIsModelReady(false);
    setModelLoadFailed(false);

    const fitProductModel = (viewport = readStageViewport(stage)) => {
      if (!productModel) return;
      fitModelToWrapperHeight(productModel, camera, viewport, modelScaleRef.current);
    };
    refitSceneRef.current = fitProductModel;

    const resizeScene = (width: number, height: number) => {
      const viewport = normalizeViewport(width, height);
      renderer.setSize(viewport.width, viewport.height, false);
      camera.aspect = viewport.width / viewport.height;
      camera.updateProjectionMatrix();
      fitProductModel(viewport);
    };

    const initialViewport = readStageViewport(stage);
    resizeScene(initialViewport.width, initialViewport.height);

    loadUploadedProductModel(product, colorway, surfaceMode)
      .then((uploadedModel) => {
        if (!uploadedModel || !isMounted) return;
        uploadedModel.rotation.set(0.05, -0.52, 0);
        productModel = uploadedModel;
        scene.add(productModel);
        fitProductModel();
        setIsModelReady(true);
      })
      .catch(() => {
        if (isMounted) setModelLoadFailed(true);
      });

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      resizeScene(width, height);
    });
    resizeObserver.observe(stage);

    let frameId = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragging || !productModel) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      productModel.rotation.y += deltaX * 0.01;
      productModel.rotation.x = clamp(productModel.rotation.x + deltaY * 0.006, -0.55, 0.65);
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    const render = () => {
      if (productModel && autoRotate && !dragging) productModel.rotation.y += 0.0045;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      isMounted = false;
      refitSceneRef.current = null;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      disposeObject(scene);
      renderer.dispose();
    };
  }, [autoRotate, colorway, modelKind, product, surfaceMode]);

  function handleModelScaleChange(delta: number) {
    setModelScale((current) => {
      const next = clamp(current + delta, MODEL_MIN_USER_SCALE, MODEL_MAX_USER_SCALE);
      modelScaleRef.current = next;
      window.requestAnimationFrame(() => refitSceneRef.current?.());
      return next;
    });
  }

  function handleColorwayChange(index: number) {
    setColorwayIndex(index);
    notifyCustomization(product, colorways[index].label, surfaceMode, onAgentActivity);
  }

  function handleSurfaceModeChange(mode: SurfaceMode) {
    setSurfaceMode(mode);
    notifyCustomization(product, colorway.label, mode, onAgentActivity);
  }

  return (
    <div className="relative min-h-[390px] overflow-hidden bg-[radial-gradient(circle_at_30%_18%,rgba(255,255,255,0.96),rgba(232,239,246,0.92)_38%,rgba(206,218,230,0.95))] sm:min-h-[440px]">
      <div ref={stageRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full cursor-grab touch-none active:cursor-grabbing" />
      </div>

      {!isModelReady ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <div className="rounded-md border border-white/70 bg-white/86 px-4 py-3 text-xs font-semibold text-graphite shadow-panel backdrop-blur">
            {modelLoadFailed ? "3D asset unavailable" : "Loading 3D asset"}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-4 top-4 rounded-md border border-white/70 bg-white/82 p-3 pr-16 text-ink shadow-sm backdrop-blur sm:inset-x-5 sm:top-5 sm:pr-20">
        {/* <div className="inline-flex items-center gap-2 rounded bg-white/86 px-3 py-2 text-xs font-semibold shadow-panel backdrop-blur">
          <Palette size={14} className="text-iris" />
          {modelSource === "uploaded" ? "Product 3D asset" : "Interactive 3D fit view"}
        </div> */}
        <h3 className="max-w-full break-words text-lg font-semibold leading-snug sm:text-xl">{product.name}</h3>
        <p className="mt-1 max-w-full truncate text-xs font-medium text-graphite sm:text-sm">{product.category}</p>
      </div>

      <div className="absolute right-4 top-4 grid gap-2 sm:right-5 sm:top-5">
        <IconButton label="Scale product up" onClick={() => handleModelScaleChange(0.12)}>
          <Plus size={17} />
        </IconButton>
        <IconButton label="Scale product down" onClick={() => handleModelScaleChange(-0.12)}>
          <Minus size={17} />
        </IconButton>
        <IconButton label="Toggle product rotation" active={autoRotate} onClick={() => setAutoRotate((value) => !value)}>
          <RotateCw size={17} />
        </IconButton>
      </div>

      <div className="absolute inset-x-3 bottom-3 grid gap-3 rounded-md border border-white/70 bg-white/88 p-3 shadow-panel backdrop-blur sm:inset-x-5 sm:bottom-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-graphite">Colorway</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {colorways.map((option, index) => (
              <button
                key={option.label}
                type="button"
                aria-label={`Set ${option.label} colorway`}
                title={option.label}
                onClick={() => handleColorwayChange(index)}
                className={[
                  "grid h-9 w-9 place-items-center rounded-md border transition",
                  index === colorwayIndex ? "border-pine ring-2 ring-pine/20" : "border-slate-200 hover:border-pine"
                ].join(" ")}
              >
                <span
                  className="block h-5 w-5 rounded-sm"
                  style={{
                    background: `linear-gradient(135deg, ${option.primary} 0 48%, ${option.secondary} 48% 72%, ${option.accent} 72%)`
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-graphite">Surface</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {surfaceModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => handleSurfaceModeChange(mode.value)}
                className={[
                  "min-h-9 rounded-md border px-3 text-xs font-semibold transition",
                  surfaceMode === mode.value ? "border-pine bg-pine text-white" : "border-slate-200 bg-white text-ink hover:border-pine"
                ].join(" ")}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function loadUploadedProductModel(
  product: Product,
  colorway: (typeof colorways)[number],
  surfaceMode: SurfaceMode
): Promise<THREE.Group | undefined> {
  const modelUrl = await resolveProductModelUrl(product);
  if (!modelUrl) return undefined;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelUrl);
  return prepareUploadedProductModel(gltf.scene, colorway, surfaceMode);
}

async function resolveProductModelUrl(product: Product): Promise<string | undefined> {
  if (product.modelUrl) {
    const configuredModel = await checkModelUrl(product.modelUrl);
    if (configuredModel) return configuredModel;
  }

  const candidates = [`/models/products/${product.id}.glb`, `/models/products/${product.id}.gltf`];

  for (const candidate of candidates) {
    const modelUrl = await checkModelUrl(candidate);
    if (modelUrl) return modelUrl;
  }

  return undefined;
}

async function checkModelUrl(modelUrl: string) {
  try {
    const response = await fetch(modelUrl, { method: "HEAD" });
    return response.ok ? modelUrl : undefined;
  } catch {
    return undefined;
  }
}

function prepareUploadedProductModel(
  model: THREE.Object3D,
  colorway: (typeof colorways)[number],
  surfaceMode: SurfaceMode
) {
  const group = new THREE.Group();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => customizeUploadedMaterial(material, surfaceMode))
      : customizeUploadedMaterial(child.material, surfaceMode);
  });

  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);

  model.position.sub(center);
  group.add(model);

  return group;
}

function fitModelToWrapperHeight(
  model: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  viewport: { width: number; height: number },
  userScale: number
) {
  if (viewport.width < 1 || viewport.height < 1) return;

  const targetRatio = clamp(
    MODEL_VIEWPORT_HEIGHT_RATIO * userScale,
    MODEL_VIEWPORT_HEIGHT_RATIO * MODEL_MIN_USER_SCALE,
    MODEL_VIEWPORT_HEIGHT_RATIO * MODEL_MAX_USER_SCALE
  );
  const targetHeight = viewport.height * targetRatio;
  camera.updateMatrixWorld(true);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    model.updateMatrixWorld(true);
    const projectedBounds = measureProjectedBounds(model, camera, viewport);
    if (!projectedBounds || projectedBounds.height < 1) return;

    const scaleFactor = clamp(targetHeight / projectedBounds.height, 0.02, 50);
    if (Math.abs(1 - scaleFactor) < 0.01) return;
    model.scale.multiplyScalar(scaleFactor);
  }

  model.updateMatrixWorld(true);
}

function measureProjectedBounds(
  model: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  viewport: { width: number; height: number }
) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return undefined;

  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z)
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  corners.forEach((corner) => {
    corner.project(camera);
    if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return;

    const screenX = (corner.x * 0.5 + 0.5) * viewport.width;
    const screenY = (-corner.y * 0.5 + 0.5) * viewport.height;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
  });

  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return undefined;

  return {
    height: Math.max(maxY - minY, 0),
    width: Math.max(maxX - minX, 0)
  };
}

function readStageViewport(stage: HTMLElement) {
  const rect = stage.getBoundingClientRect();
  return normalizeViewport(rect.width, rect.height);
}

function normalizeViewport(width: number, height: number) {
  return {
    width: Math.max(Math.round(width), 1),
    height: Math.max(Math.round(height), 1)
  };
}

function customizeUploadedMaterial(
  material: THREE.Material,
  surfaceMode: SurfaceMode
) {
  const cloned = material.clone();

  if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
    const finish = makeMaterial("#ffffff", surfaceMode);
    cloned.roughness = finish.roughness;
    cloned.metalness = Math.max(cloned.metalness, finish.metalness);
  }

  return cloned;
}

function notifyCustomization(
  product: Product,
  colorway: string,
  surfaceMode: SurfaceMode,
  onAgentActivity: (activity: AgentActivityInput) => void
) {
  trackAnalyticsEvent({
    eventName: "product_customized",
    productIds: [product.id],
    metadata: {
      colorway,
      surfaceMode,
      product_categories: [product.category],
      product_names: [product.name]
    }
  }).catch(() => undefined);

  onAgentActivity({
    agent: "3D Product Visualization Agent",
    action: `${product.name} customized`,
    detail: `Applies ${colorway.toLowerCase()} color and ${surfaceMode} finish to the selected product view.`,
    tone: "iris"
  });
}

function getProductModelKind(product: Product): ProductModelKind {
  const haystack = `${product.category} ${product.name} ${product.tags.join(" ")}`.toLowerCase();

  if (haystack.includes("slide")) return "slide";
  if (haystack.includes("hiking") || haystack.includes("trail")) return "trail_shoe";
  if (haystack.includes("shoe") || haystack.includes("footwear") || haystack.includes("trainer")) return "shoe";
  if (haystack.includes("jacket") || haystack.includes("outerwear")) return "jacket";
  if (haystack.includes("vest") || haystack.includes("hydration")) return "vest";
  if (haystack.includes("bag") || haystack.includes("tote")) return "bag";
  return "apparel";
}

function createProductModel(
  product: Product,
  kind: ProductModelKind,
  colorway: (typeof colorways)[number],
  surfaceMode: SurfaceMode
) {
  const group = new THREE.Group();
  const material = makeMaterial(colorway.primary, surfaceMode);
  const secondaryMaterial = makeMaterial(colorway.secondary, surfaceMode);
  const accentMaterial = makeMaterial(colorway.accent, surfaceMode, true);
  const soleMaterial = makeMaterial(colorway.sole, "matte");

  if (kind === "shoe" || kind === "trail_shoe" || kind === "slide") {
    buildShoe(group, kind, material, secondaryMaterial, accentMaterial, soleMaterial);
  } else if (kind === "jacket") {
    buildJacket(group, material, secondaryMaterial, accentMaterial);
  } else if (kind === "vest") {
    buildVest(group, material, secondaryMaterial, accentMaterial);
  } else if (kind === "bag") {
    buildBag(group, material, secondaryMaterial, accentMaterial, soleMaterial);
  } else {
    buildApparel(group, product, material, secondaryMaterial, accentMaterial);
  }

  return group;
}

function buildShoe(
  group: THREE.Group,
  kind: ProductModelKind,
  material: THREE.Material,
  secondaryMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  soleMaterial: THREE.Material
) {
  addBox(group, soleMaterial, [0, -0.62, 0], [3.35, 0.34, 1.05]);
  addSphere(group, material, [-0.2, -0.25, 0], [1.45, 0.46, 0.62]);
  addSphere(group, secondaryMaterial, [0.92, -0.35, 0], [0.75, 0.32, 0.58]);
  addBox(group, material, [-1.32, -0.18, 0], [0.7, kind === "trail_shoe" ? 0.88 : 0.62, 0.88]);
  addBox(group, accentMaterial, [-0.12, 0.02, 0.02], [1.1, 0.05, 0.82], [0, 0, -0.08]);

  for (let index = 0; index < 5; index += 1) {
    addBox(group, secondaryMaterial, [-0.58 + index * 0.27, 0.12, 0.02], [0.04, 0.08, 0.86], [0, 0, 0.4]);
  }

  const treadCount = kind === "trail_shoe" ? 9 : 6;
  for (let index = 0; index < treadCount; index += 1) {
    addBox(group, soleMaterial, [-1.36 + index * 0.36, -0.86, 0.45], [0.18, 0.1, 0.2]);
    addBox(group, soleMaterial, [-1.36 + index * 0.36, -0.86, -0.45], [0.18, 0.1, 0.2]);
  }

  if (kind === "slide") {
    addBox(group, material, [-0.08, -0.1, 0], [1.55, 0.24, 1.15], [0, 0, -0.12]);
  }

  if (kind === "trail_shoe") {
    addBox(group, accentMaterial, [-1.44, 0.4, 0], [0.62, 0.48, 0.74]);
  }
}

function buildJacket(group: THREE.Group, material: THREE.Material, secondaryMaterial: THREE.Material, accentMaterial: THREE.Material) {
  addBox(group, material, [0, -0.12, 0], [1.72, 2.26, 0.46]);
  addBox(group, secondaryMaterial, [-1.12, -0.22, 0], [0.48, 1.7, 0.4], [0, 0, -0.2]);
  addBox(group, secondaryMaterial, [1.12, -0.22, 0], [0.48, 1.7, 0.4], [0, 0, 0.2]);
  addSphere(group, material, [0, 1.18, -0.1], [0.78, 0.42, 0.38]);
  addBox(group, accentMaterial, [0, -0.08, 0.26], [0.06, 1.96, 0.04]);
  addBox(group, accentMaterial, [-0.48, -0.48, 0.28], [0.5, 0.04, 0.04], [0, 0, -0.22]);
  addBox(group, accentMaterial, [0.48, -0.48, 0.28], [0.5, 0.04, 0.04], [0, 0, 0.22]);
}

function buildVest(group: THREE.Group, material: THREE.Material, secondaryMaterial: THREE.Material, accentMaterial: THREE.Material) {
  addBox(group, material, [-0.48, -0.06, 0], [0.76, 1.82, 0.36], [0, 0, 0.04]);
  addBox(group, material, [0.48, -0.06, 0], [0.76, 1.82, 0.36], [0, 0, -0.04]);
  addBox(group, accentMaterial, [0, -0.06, 0.24], [0.07, 1.62, 0.05]);
  addCylinder(group, secondaryMaterial, [-0.58, -0.24, 0.38], [0.18, 0.18, 0.82], [Math.PI / 2, 0, 0]);
  addCylinder(group, secondaryMaterial, [0.58, -0.24, 0.38], [0.18, 0.18, 0.82], [Math.PI / 2, 0, 0]);
  addBox(group, accentMaterial, [0, 0.8, 0.26], [1.2, 0.08, 0.05]);
}

function buildBag(
  group: THREE.Group,
  material: THREE.Material,
  secondaryMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  trimMaterial: THREE.Material
) {
  addBox(group, material, [0, -0.24, 0], [2.2, 1.38, 1.05]);
  addBox(group, secondaryMaterial, [0, 0.52, 0.04], [2.02, 0.16, 1.08]);
  addBox(group, trimMaterial, [-1.18, -0.22, 0.04], [0.08, 1.32, 1.12]);
  addBox(group, trimMaterial, [1.18, -0.22, 0.04], [0.08, 1.32, 1.12]);
  addTorus(group, accentMaterial, [-0.56, 0.72, 0], [0.42, 0.18, 0.42], [Math.PI / 2, 0, 0]);
  addTorus(group, accentMaterial, [0.56, 0.72, 0], [0.42, 0.18, 0.42], [Math.PI / 2, 0, 0]);
}

function buildApparel(group: THREE.Group, product: Product, material: THREE.Material, secondaryMaterial: THREE.Material, accentMaterial: THREE.Material) {
  const isHoodie = `${product.name} ${product.tags.join(" ")}`.toLowerCase().includes("hoodie");
  addBox(group, material, [0, -0.1, 0], [1.55, 2.1, 0.4]);
  addBox(group, secondaryMaterial, [-1.02, -0.22, 0], [0.42, 1.42, 0.36], [0, 0, -0.28]);
  addBox(group, secondaryMaterial, [1.02, -0.22, 0], [0.42, 1.42, 0.36], [0, 0, 0.28]);
  addBox(group, accentMaterial, [0, 0.58, 0.24], [0.58, 0.08, 0.05]);

  if (isHoodie) {
    addSphere(group, material, [0, 1.1, -0.08], [0.62, 0.36, 0.34]);
    addBox(group, accentMaterial, [0, -0.58, 0.25], [0.76, 0.4, 0.05]);
  }
}

function makeMaterial(color: string, surfaceMode: SurfaceMode, accent = false) {
  const surface = {
    matte: { roughness: 0.78, metalness: 0.05 },
    weather: { roughness: 0.42, metalness: 0.12 },
    reflective: { roughness: 0.18, metalness: 0.38 }
  }[surfaceMode];

  return new THREE.MeshStandardMaterial({
    color,
    metalness: accent ? Math.min(surface.metalness + 0.12, 0.55) : surface.metalness,
    roughness: accent ? Math.max(surface.roughness - 0.14, 0.12) : surface.roughness
  });
}

function addBox(
  group: THREE.Group,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addSphere(
  group: THREE.Group,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number]
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.72, 36, 18), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addCylinder(
  group: THREE.Group,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addTorus(
  group: THREE.Group,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 18, 64), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(disposeMaterial);
  });
}

function disposeMaterial(material: THREE.Material) {
  const maybeTextured = material as THREE.Material & Record<string, unknown>;
  ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"].forEach((key) => {
    const texture = maybeTextured[key];
    if (texture instanceof THREE.Texture) texture.dispose();
  });
  material.dispose();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
