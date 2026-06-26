# Demo Product Asset Checklist

Use this list for the retail demo. Each category has two products. Only the two products marked `3D` show the 3D icon in the app.

| Category | Product | Product ID | Demo Visual | Current image |
| --- | --- | --- | --- | --- |
| Running shoes | AeroStride Marathon Trainer | `prod_aerostride_marathon` | Image | `https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80` |
| Running shoes | Velocity Tempo Runner | `prod_velocity_tempo` | Image | `https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80` |
| Outdoor footwear | TerraGrip Hiking Shoe | `prod_terra_grip` | 3D | `https://images.unsplash.com/photo-1520639888713-7851133b1ed0?auto=format&fit=crop&w=900&q=80` |
| Outdoor footwear | RidgeFlow Trail Runner | `prod_ridgeflow_trail` | Image | `https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=900&q=80` |
| Apparel | CoreFlex Training Tee | `prod_coreflex_tee` | Image | `https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=900&q=80` |
| Apparel | Balance Merino Hoodie | `prod_balance_hoodie` | Image | `https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80` |
| Outerwear | TrailForm All Weather Jacket | `prod_trailform_jacket` | 3D | `https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=900&q=80` |
| Outerwear | CloudShield Packable Anorak | `prod_cloudshield_anorak` | Image | `https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80` |
| Accessories | Momentum Hydration Vest | `prod_momentum_vest` | Image | `https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80` |
| Accessories | AeroCap Performance Hat | `prod_aerocap_hat` | Image | `https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=900&q=80` |
| Recovery footwear | Pulse Recovery Slides | `prod_pulse_slides` | Image | `https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=80` |
| Recovery footwear | CloudRest Recovery Sandal | `prod_cloudrest_sandal` | Image | `https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=900&q=80` |
| Bags | UrbanLoft Weekender Tote | `prod_weekender_tote` | Image | `https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=80` |
| Bags | TrailGate Gear Duffel | `prod_trailgate_duffel` | Image | `https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80` |

## Upload Files

Upload 3D files:

```text
public/models/products/prod_terra_grip.glb
public/models/products/prod_trailform_jacket.glb
```

Upload image replacements:

```text
public/images/products/<product-id>.jpg
```

Then update `imageUrl` in `data/catalog/products.json` to point to the local image path.
