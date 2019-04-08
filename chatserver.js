// Require the packages we will use:
const http = require("http"),
    socketio = require("socket.io"),
    fs = require("fs");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
let app = http.createServer(function(req, resp){
    // This callback runs when a new connection is made to our HTTP server.

    fs.readFile("index.html", function(err, data){
        // This callback runs when the client.html file has been read from the filesystem.

        if(err) return resp.writeHead(500);
        resp.writeHead(200);
        resp.end(data);
    });
});
app.listen(3456);

// a global variable: an array which stores all the rooms
let rooms = [];
// a global variable: an array which stores all the users' nicknames
let names = [];

// Do the Socket.IO magic:
const io = socketio.listen(app);
io.sockets.on("connection", function(socket){
    // This callback runs when a new Socket.IO connection is established.
    let isCreated = false;

    socket.on('message_to_server', function(data) {
        // This callback runs when the server receives a new message from the client.

        console.log("msg: " + data["nickname"] + ": " +data["message"] + ": " + data["room"].name); // log it to the Node.JS output
        io.sockets.to(data["room"]).emit("message_to_client",{message: data["message"], nickname: data["nickname"], room: data["room"]}) // broadcast the message to other users
    });

    // Callback function when the server receives the request from the client to login, and display all the rooms
    socket.on('create_user', function (nickname) {
        console.log("Your name: " + nickname);
        if(isCreated)
            return;
        // Check if the user' s nickname already exists
        let valid = true;
        for(let i = 0; i < names.length; i++) {
            if(names[i] === nickname) {
                valid = false;
                break;
            }
            else {
                valid = true;
            }
        }
        if(valid) {
            socket.nickname = nickname;
            names.push(socket.nickname);
        }
        io.sockets.emit("create_user_to_client", {rooms: rooms, valid: valid, nickname: socket.nickname, names: names})
    });

    socket.on('create_room', data => {
        // single room object
        let room = {};
        room.users = [];
        room.ban = [];
        room.name = data['roomName'];
        room.password = data['password'];
        room.owner = data['owner'];
        rooms.push(room);
        io.sockets.emit("create_room_to_client", {rooms: rooms, names: names})
    });

    socket.on('joinRoom', data => {
        let isPermit = true;
        let curr = data['room'];
        for(let i = 0; i < rooms.length; i++) {
            if(rooms[i].name === curr.name && rooms[i].owner === curr.owner && rooms[i].password === curr.password) {
                curr = rooms[i];
                break;
            }
        }
        for(let i = 0; i < curr.ban.length; i++) {
            if(curr.ban[i] === data['nickname']) {
                isPermit = false;
                break;
            }
        }
        if(isPermit) {
            socket.join(data['room']);
            socket.room = data['room'];
            // Update current users in the room list
            const curr = data['room'];
            for(let j = 0; j < rooms.length; j++) {
                if(rooms[j].name === curr.name && rooms[j].owner === curr.owner && rooms[j].password === curr.password) {
                    let flag = true;
                    for(let i = 0; i < rooms[j].users.length; i++) {
                        if(rooms[j].users[i] === data['nickname']) {
                            flag = false;
                            break;
                        }
                    }
                    if(flag) {
                        rooms[j].users.push(data['nickname']);
                    }
                    data['room'] = rooms[j];
                }
            }
        }
        io.sockets.emit("joinRoom_to_client", {nickname: data['nickname'],isPermit: isPermit, room: data['room']})
    });

    // Callback function when leaving a room
    socket.on('back_to_room', data => {
        // Update current users in the room list
        const curr = data['room'];
        for(let i = 0; i < rooms.length; i++) {
            if(rooms[i].name === curr.name && rooms[i].owner === curr.owner && rooms[i].password === curr.password) {
                for(let j = 0; j < rooms[i].users.length; j++) {
                    if(rooms[i].users[j] === data['nickname']) {
                        rooms[i].users.splice(j, 1);
                        break;
                    }
                }
                data['room'] = rooms[i];
                break;
            }
        }
        io.sockets.emit("back_to_client", {room: data['room'], quit_user: data['nickname'], rooms: rooms, names:names})
    });

    // Callback function when kicking a user
    socket.on('kick', data => {
        // Update current users in the room list
        const curr = data['room'];
        for(let i = 0; i < rooms.length; i++) {
            if(rooms[i].name === curr.name && rooms[i].owner === curr.owner && rooms[i].password === curr.password) {
                for(let j = 0; j < rooms[i].users.length; j++) {
                    if(rooms[i].users[j] === data['kicked']) {
                        rooms[i].users.splice(j, 1);
                        break;
                    }
                }
                data['room'] = rooms[i];
                break;
            }
        }
        io.sockets.emit("kick_to_client", {room: data['room'], quit_user: data['kicked']})
    });

    // Callback function when banning a user
    socket.on('ban', data => {
        // Update current users in the room list
        const curr = data['room'];
        for(let i = 0; i < rooms.length; i++) {
            if(rooms[i].name === curr.name && rooms[i].owner === curr.owner && rooms[i].password === curr.password) {
                for(let j = 0; j < rooms[i].users.length; j++) {
                    if(rooms[i].users[j] === data['banned']) {
                        rooms[i].users.splice(j, 1);
                        break;
                    }
                }
                rooms[i].ban.push(data['banned']);
                data['room'] = rooms[i];
                break;
            }
        }
        io.sockets.emit("ban_to_client", {room: data['room'], quit_user: data['banned']})
    });

    // Callback function when grant a user admin
    socket.on('grantAdmin', data => {
        // Update current users in the room list
        const curr = data['room'];
        for(let i = 0; i < rooms.length; i++) {
            if(rooms[i].name === curr.name && rooms[i].owner === curr.owner && rooms[i].password === curr.password) {
                rooms[i].owner = data['admin'];
                data['room'] = rooms[i];
                break;
            }
        }
        io.sockets.emit("grantAdmin_to_client", {room: data['room']})
    });

    // Callback function when the server receives the request from the client to logout
    socket.on('logout', nickname => {
        for(let i = 0; i < names.length; i++) {
            if(names[i] === nickname)
                names.splice(i, 1);
        }
        io.sockets.emit("logout_to_client", {rooms: rooms, names: names})
    });

    // Change room password
    socket.on("modify_pwd", data => {
        const curr = data['room'];
        console.log(curr.name+curr.password);
        for(let i = 0; i < rooms.length; i++) {
            if(rooms[i].name === curr.name && rooms[i].owner === curr.owner && rooms[i].password === curr.password) {
                rooms[i].password = data['new_pwd'];
                data['room'] = rooms[i];
                break;
            }
        }
        io.sockets.emit("modify_pwd_to_client", {room: data['room'], rooms: rooms, names: names})
    });

    // receive send private message request
    socket.on("sendPrivate", data => {
        io.sockets.to(data["room"]).emit("sendPrivate_to_client", {sendFrom: data['sendFrom'], sendTo: data['sendTo'], msg: data['msg'], room: data['room']})
    });

});

