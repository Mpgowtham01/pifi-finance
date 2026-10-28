// A picture kept beside a record: the customer's photo and specimen
// signature, and the photo of the jewels a loan is pledged against. The old
// app used a plain file box; this one shows what is on file and lets it be
// replaced or taken off.

export default function ImageBox({ label, state, onPick, onClear, shape }) {
  return (
    <div className={`image-box ${shape}`}>
      <span className="image-label">{label}</span>
      <label className="image-frame" title={`Upload ${label.toLowerCase()}`}>
        {state.src ? (
          <img src={state.src} alt={label} />
        ) : (
          <span className="image-empty">
            <span className="image-plus">+</span>
            Add {label.toLowerCase()}
          </span>
        )}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPick} />
      </label>
      {state.src && (
        <button type="button" className="btn tiny ghost" onClick={onClear}>
          Remove
        </button>
      )}
    </div>
  )
}

// Scale an uploaded image down before it ever leaves the browser, so pictures
// stay small enough to live beside the record they belong to.
export function shrink(file, maxSide = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      return reject(new Error('Pick a PNG, JPEG or WebP image.'))
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a readable image.'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
