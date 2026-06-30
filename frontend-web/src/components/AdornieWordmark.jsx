export default function AdornieWordmark({ className = "" }) {
  return (
    <>
      <img
        src="/adorniehomedecorpreto.png"
        alt="Adornie"
        className={`adornie-wordmark adornie-wordmark-preto ${className}`}
      />
      <img
        src="/adorniehomedecorbranco.png"
        alt="Adornie"
        className={`adornie-wordmark adornie-wordmark-branco ${className}`}
      />
    </>
  );
}
