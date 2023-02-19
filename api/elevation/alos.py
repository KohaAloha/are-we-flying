from osgeo import gdal, osr
from os import listdir
from os.path import isdir, isfile, join
from math import ceil, floor

SEA_LEVEL = 0
ALOS_VOID_VALUE = -9999


class ALOS30m():
    """
    JAXA ALOS World 3D (30m) dataset manager
    homepage: https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm
    data format: https://www.eorc.jaxa.jp/ALOS/en/aw3d30/aw3d30v11_format_e.pdf
    license: https://earth.jaxa.jp/en/data/policy/
    """

    def __init__(self, tiles_folder):
        self.tiles_folder = tiles_folder
        self.files = []
        self.cache = {}
        self.find_files()

    def find_files(self, dir=None):
        """
        Recursively find all tiles. This will take a bit of time,
        but crucially we're not *loading* any of these files, so
        as long as the filesystem is fast, this operation will
        only take a few seconds to load in around 24k file paths
        (for the full ALOS World3D (30m) dataset at least).
        """
        if dir is None:
            dir = self.tiles_folder
        for f in listdir(dir):
            full_path = join(dir, f)
            if isfile(full_path):
                if full_path.endswith(u'.tif'):
                    self.files.append(full_path)
            if isdir(full_path):
                self.find_files(full_path)

    def lookup(self, lat, lng):
        """
        Find an elevation by first finding which tile that coordinate
        would be in, reporting an error if no such file exists, or
        loading (and caching) the tile and running the lookup.
        """
        lat = float(lat)
        lng = float(lng)
        tile_name, tile_path = self.get_tile_for(lat, lng)

        if tile_name is None:
            return None

        if tile_path not in self.cache:
            self.cache[tile_path] = ALOSTile(tile_path)

        v = self.cache[tile_path].lookup(lat, lng)

        # return a "real" int instead of an int16
        return v

    def get_tile_for(self, lat, lng):
        """
        ALOS tiles are named ALPSMKC30_UyyyWxxx_DSM.tif, where
        U is either "N" or "S", yyy is the degree of latitude
        (with leading zeroes if necessary), W is either "E" or
        "W", and xxx is the degree of longitude (again with
        leading zeroes if necessary).
        """
        lat_dir = "N" if lat >= 0 else "S"
        lng_dir = "E" if lng >= 0 else "W"
        lat = floor(lat) if lat_dir == "N" else ceil(-lat)
        lng = floor(lng) if lng_dir == "E" else ceil(-lng)

        tile_name = "ALPSMLC30_%s%03d%s%03d_DSM.tif" % (
            lat_dir, lat, lng_dir, lng)

        # find the full path for this file in the list of
        # known files we built in find_files().
        full_path = [f for f in self.files if f.endswith(tile_name)]

        if len(full_path) == 0:
            return None, None

        return tile_name, full_path[0]


class ALOSTile():
    def __init__(self, tile_path):
        """
        Load a tile, and cache it. Individual tiles are relatively
        small, so for performance we preload the entire tile's
        elevation data into RAM.
        """
        self.tile_path = tile_path
        self.dataset = gdal.Open(tile_path, gdal.GA_ReadOnly)

        if self.dataset is None:
            raise Exception(f'Could not load GDAL file{tile_path}')

        src = osr.SpatialReference()
        src.SetWellKnownGeogCS("WGS84")
        dest = osr.SpatialReference(self.dataset.GetProjection())
        self.ct = osr.CoordinateTransformation(src, dest)
        self.grid = self.dataset.GetRasterBand(1).ReadAsArray()

    def lookup(self, lat, lon):
        """
        see https://gis.stackexchange.com/a/415337/219296
        """
        try:
            forward_transform = self.dataset.GetGeoTransform()
            reverse_transform = gdal.InvGeoTransform(forward_transform)
            x, y = [int(v) for v in gdal.ApplyGeoTransform(
                reverse_transform, lon, lat)]
            return int(self.grid[y][x])

        except:
            return None
