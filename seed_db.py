
import sqlite3
import json

# Sample GeoJSON feature
geojson_feature = {
    "type": "Feature",
    "properties": {
        "mag": 5.8,
        "place": "10km NE of The Geysers, CA",
        "time": 1672531200000,
        "updated": 1672531200000,
        "tz": None,
        "url": "https://earthquake.usgs.gov/earthquakes/eventpage/nc73839106",
        "detail": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc73839106.geojson",
        "felt": None,
        "cdi": None,
        "mmi": None,
        "alert": None,
        "status": "reviewed",
        "tsunami": 0,
        "sig": 518,
        "net": "nc",
        "code": "73839106",
        "ids": ",nc73839106,",
        "sources": ",nc,",
        "types": ",origin,phase-data,",
        "nst": 65,
        "dmin": 0.00781,
        "rms": 0.04,
        "gap": 56,
        "magType": "mw",
        "type": "earthquake",
        "title": "M 5.8 - 10km NE of The Geysers, CA"
    },
    "geometry": {
        "type": "Point",
        "coordinates": [-122.7, 38.8, -1.9]
    },
    "id": "nc73839106"
}

# Connect to the D1 database
db_path = '.wrangler/state/d1/DB.sqlite3'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Insert the sample data
cursor.execute("""
    INSERT INTO EarthquakeEvents (
        id, event_time, latitude, longitude, depth, magnitude,
        title, usgs_url, detail_url, geojson_feature, has_shakemap,
        has_dyfi, has_moment_tensor, detail_fetched, detail_fetch_attempts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
    geojson_feature['id'],
    geojson_feature['properties']['time'],
    geojson_feature['geometry']['coordinates'][1],
    geojson_feature['geometry']['coordinates'][0],
    geojson_feature['geometry']['coordinates'][2],
    geojson_feature['properties']['mag'],
    geojson_feature['properties']['title'],
    geojson_feature['properties']['url'],
    geojson_feature['properties']['detail'],
    json.dumps(geojson_feature),
    False,
    False,
    False,
    False,
    0
))

conn.commit()
conn.close()

print("Database seeded successfully.")
