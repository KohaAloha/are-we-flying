1. Start
   - initialize dependencies
   - wait for server to be up [-> 2]
2. Server is running
   - start listening for simulation properties [-> 3]
3. Simulation is running, user is on main menu
   - listen for "game started" event [-> 4]
   - listen for "exit" event [-> 10]
4. User is in-game
   - listen for "paused" event [-> 5]
   - listen for "crashed" event [-> 8]
   - listen for gameplay data [-> 6]
5. User is paused in-game
   - listen for "unpaused" event [-> 4]
   - listen for "reset" event [-> 9]
   - listen for "left game" event [-> 3]
6. User started playing
   - set up a visualisation
   - listen for gameplay data [-> 7]
7. User is playing (main loop)
   - update vizualization based on gameplay data
   - listen for "paused" event [-> 5]
   - listen for "crashed" event [-> 8]
   - listen for gameplay data [-> 7]
8. User has crashed
   - update visualization with crash information
   - listen for "reset" event [-> 9]
   - listen for "left game" event [-> 3]
9. User has reset their game
   - update vizualization to reflect the reset
   - listen for gameplay data [-> 7]
10. User has quit the game
    - update visualization
    - start listening for simulation properties again [-> 3]