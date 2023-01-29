- add preset curves to constrain_map so that we can do linear vs. ease-out vs. drop-off
- Fix heading oscillation when setting HDG to "current +/- 180"
- move terrain-follow from JS to python?
- fix predictive terrain follow, it's using the wrong angle for heading and keeps crashing us into mountain sides


Glitch:
- the whole "create a dir by including it in a filename" is infuriating
  - add normal dir creation
  - update "upload" to upload into a specific dir
  - add file dragging so we can trivially move files/dirs
- fastify can't run on Node 10, so that's hilarious
