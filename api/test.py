from SimConnect import *

# Create SimConnect link
sm = SimConnect()

# Note the default _time is 2000 to be refreshed every 2 seconds
aq = AircraftRequests(sm, _time=2000)

# Use _time=ms where ms is the time in milliseconds to cache the data.
# Setting ms to 0 will disable data caching and always pull new data from the sim.
# There is still a timeout of 4 tries with a 10ms delay between checks.
# If no data is received in 40ms the value will be set to None
# Each request can be fine tuned by setting the time param.

# To find and set timeout of cached data to 200ms:
altitude = aq.find("CAMERA_STATE")

print(aq.get("TITLE"))
print(360 * float(aq.get("PLANE_HEADING_DEGREES_TRUE")) /  6.28)

# print(aq.get("STATIC_CG_TO_GROUND"),  aq.get("PLANE_ALT_ABOVE_GROUND"))


# Get the aircraft's current altitude
# print(aq.get("CAMERA_GAMEPLAY_PITCH_YAW:0"))
# print(aq.get("CAMERA_GAMEPLAY_PITCH_YAW:1"))
# print(aq.get("CAMERA_REQUEST_ACTION"))
# print(aq.get("CAMERA_STATE"))
# print(aq.get("CAMERA_SUBSTATE"))
# print(aq.get("CAMERA_VIEW_TYPE_AND_INDEX:0"))
# print(aq.get("CAMERA_VIEW_TYPE_AND_INDEX_MAX:0"))
# print(aq.get("GAMEPLAY_CAMERA_FOCUS"))
# print(aq.get("IS_CAMERA_RAY_INTERSECT_WITH_NODE"))

# # Set the aircraft's current altitude
# aq.set("PLANE_ALTITUDE", altitude)

# ae = AircraftEvents(sm)

# # Trigger a simple event
# event_to_trigger = ae.find("AP_MASTER")  # Toggles autopilot on or off
# event_to_trigger()

# # Trigger an event while passing a variable
# target_altitude = 15000
# event_to_trigger = ae.find("AP_ALT_VAR_SET_ENGLISH")  # Sets AP autopilot hold level
# event_to_trigger(target_altitude)

sm.exit()
quit()
