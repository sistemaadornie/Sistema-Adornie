import { useState } from "react";
import Cropper from "react-easy-crop";

export default function ImageCropModal({ file, onClose, onSave }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const imageUrl = URL.createObjectURL(file);

  function onCropComplete(_, croppedPixels) {
    setCroppedAreaPixels(croppedPixels);
  }

  async function handleSave() {
    const croppedImage = await getCroppedImg(imageUrl, croppedAreaPixels);
    onSave(croppedImage);
  }

  return (
    <div className="crop-modal">
      <div className="crop-container">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="crop-actions">
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(e.target.value)}
        />

        <button onClick={onClose}>Cancelar</button>
        <button onClick={handleSave}>Salvar</button>
      </div>
    </div>
  );
}

// 🔥 função que gera imagem cortada
async function getCroppedImg(imageSrc, crop) {
  const image = new Image();
  image.src = imageSrc;

  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = crop.width;
  canvas.height = crop.height;

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, "image/jpeg");
  });
}