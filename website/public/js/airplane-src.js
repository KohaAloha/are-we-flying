export function getAirplaneSrc(title) {
  let pic = `plane.png`;
  let plane = title.toLowerCase();
  if (plane.includes(`rudder`)) pic = `top rudder.png`;
  else if (plane.includes(`bonanza`)) pic = `bonanza.png`;
  else if (plane.includes(`vertigo`)) pic = `vertigo.png`;
  else if (plane.includes(`d18`)) pic = `beechcraft.png`;
  else if (plane.includes(`beaver`)) pic = `beaver.png`;
  else if (plane.includes(`carbon`)) pic = `carbon.png`;
  else if (plane.includes(` 310`)) pic = `310.png`;
  else if (plane.includes(`mb-339`)) pic = `mb-339.png`;
  else if (plane.includes(`searey`)) pic = `searey.png`;
  else if (plane.includes(`kodiak`)) pic = `kodiak.png`;
  else if (plane.includes(`islander`)) pic = `islander.png`;
  else if (plane.includes(`amphibian`) || plane.includes(`float`)) {
    pic = pic.replace(`.png`, `-float.png`);
  }
  return pic;
}
