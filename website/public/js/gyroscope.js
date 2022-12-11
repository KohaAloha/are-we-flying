const content = await fetch("gyroscope.html").then((res) => res.text());
const gyro = document.getElementById(`gyroscope`);
gyro.innerHTML = content;

export const Gyro = {
  setPitchBank(pitch, bank) {
    gyro.style.setProperty(`--pitch`, pitch);
    gyro.style.setProperty(`--bank`, bank);
  },
};
