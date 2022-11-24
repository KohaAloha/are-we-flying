export function getAirplaneSrc(title) {
  let pic = `plane.png`;
  let plane = title.toLowerCase();

  // let's find our plane!
       if (plane.includes(` 152`)) pic = `152.png`;
  else if (plane.includes(` 172`)) pic = `172.png`;
  else if (plane.includes(` 310`)) pic = `310.png`;
  else if (plane.includes(` rudder`)) pic = `top rudder.png`;
  else if (plane.includes(` bonanza`)) pic = `bonanza.png`;
  else if (plane.includes(` vertigo`)) pic = `vertigo.png`;
  else if (plane.includes(` d18`)) pic = `model-18.png`;
  else if (plane.includes(` citation`)) pic = `citation.png`;
  else if (plane.includes(` king air`)) pic = `king-air.png`;
  else if (plane.includes(` beaver`)) pic = `beaver.png`;
  else if (plane.includes(` carbon`)) pic = `carbon.png`;
  else if (plane.includes(` mb-339`)) pic = `mb-339.png`;
  else if (plane.includes(` searey`)) pic = `searey.png`;
  else if (plane.includes(` kodiak`)) pic = `kodiak.png`;
  else if (plane.includes(` islander`)) pic = `islander.png`;
  else if (plane.includes(` trislander`)) pic = `trislander.png`;
  else if (plane.includes(`zenith 701`)) pic = `zenith-701.png`;

  // float plane variant?
  if (plane.includes(`amphibian`) || plane.includes(`float`)) {
    pic = pic.replace(`.png`, `-float.png`);
  }

  return pic;
}
