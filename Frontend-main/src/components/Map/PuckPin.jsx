/*
 * The user's location pin (the "puck").
 *
 * The tip of the pin sits exactly on the map point: the wrapper's centre is
 * the real location, and the pin is drawn upwards from it.
 */

function PuckPin({ className = "" }) {
  return (
    <svg
      className={`puck-pin ${className}`}
      width="36"
      height="44"
      viewBox="0 0 36 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M17.6667 0C7.92792 0 0 7.92792 0 17.6667C0 21.7852 1.4575 25.8044 4.09646 28.9733L15.5467 42.7202C16.0767 43.3496 16.8496 43.714 17.6667 43.714C18.4837 43.714 19.2567 43.3496 19.7867 42.7202L31.2369 28.9733C33.8826 25.7995 35.3321 21.7986 35.3333 17.6667C35.3333 7.92792 27.4054 0 17.6667 0ZM17.6667 24.2917C14.0119 24.2917 11.0417 21.3215 11.0417 17.6667C11.0417 14.0119 14.0119 11.0417 17.6667 11.0417C21.3215 11.0417 24.2917 14.0119 24.2917 17.6667C24.2917 21.3215 21.3215 24.2917 17.6667 24.2917Z"
        fill="#7300FF"
      />
    </svg>
  );
}

export default PuckPin;
