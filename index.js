const fs = require("fs");
const http = require("http");
const express = require("express")
const cors = require("cors");

const app = express();
app.use(cors({
    origin: "*"
}));


const _places = JSON.parse(fs.readFileSync("./places2.json", "utf-8"));
const _events = JSON.parse(fs.readFileSync("./events2.json", "utf-8"));
applyEventPropertiesToPlaces();
const _placesArr = Object.values(_places);

let _pointsGeojson = {
    type: "geojson",
    data: {
        type: "FeatureCollection",
        features: places2geojson()
    }
};

app.get("/points", (req, res) => {
    res.json(_pointsGeojson);
});

app.get("/route", (req, res) => {
    const interests = req.query["interests"];
    const wishes = req.query["wishes"];
    const maptoken = req.query["mapboxgl-token"];
    const filteredPlaces = filterPlaces(interests, wishes);
    //console.log(`available places count: ${filteredPlaces.length}`);

    let result = { 
        ok: true,
        movement: "",
        link: "",
        places: {}
    };

    if (filteredPlaces.length === 0) {
        result.ok = false;
    }
    else {
        const entries = _placesArr.filter((place) => place.icon === "entry");
    
        let placesCount = Math.floor(Math.random() * 7);
        if (placesCount < 3) {
            placesCount = Math.min(3, filteredPlaces.length);
        }
        //console.log(`active places count: ${placesCount}`);
    
        let placesIds = new Set();
        for (let i = 0; i < placesCount; ++i) {
            placesIds.add(Math.floor(Math.random() * filteredPlaces.length));
        }
        
        let places = [...placesIds].map(id => filteredPlaces[id]);
        let sorted = sortPlaces(
            places, 
            entries[Math.floor(Math.random() * entries.length)],
        )
        
        if (interests & 8) {
            result.movement = "cycling";
        } 
        else {
            result.movement = "walking";
        }
        

        sorted.forEach((s) => {
            result.places[s.id] = s;
        });

        
        result.link = generateMapboxDirectionApiLink(sorted, result.movement, maptoken);
    }

    res.json(result);
});

app.get("/filter", (req, res) => {
    const interests = Number(req.query["interests"]);
    const wishes = Number(req.query["wishes"]);
    /* console.log(`interests: ${decodeIds(interests)}`);
    console.log(`wishes: ${decodeIds(wishes)}`); */

    const filteredPlaces = filterPlaces(interests, wishes);
    res.json(filteredPlaces);
});

app.get("/id", (req, res) => {
    const id = req.query["of"];
    res.json(decodeIds(id));
});


app.listen(3000, () => {
    console.log("server is listening on port 3000")
});

function applyEventPropertiesToPlaces() {
    Object.values(_events).forEach(event => {
        const placesIds = event.places;
        placesIds.forEach(placeId => {
            if (_places[placeId]) {
                _places[placeId].interests |= event.interests;
                _places[placeId].wishes |= event.wishes;
            }
        });
    });
}

function places2geojson() {
    return Object.values(_places).map(place => place2geojson(place));
}

function place2geojson(place) {
    return {
        type: "Feature",
        id: place.id,
        geometry: {
            type: "Point",
            coordinates: place.coordinates
        },
        properties: {
            id: place.id,
            title: place.title,
            title_short: place.title_short,
            color: place.color,
            icon: place.icon,
            interests: place.interests !== undefined ? place.interests : 0,
            wishes: place.wishes !== undefined ? place.wishes : 0
        },
    };
}

function decodeIds(num) {
    let result = []
    for (let i = 0; i < 32; ++i) {
        if (num & (1 << i)) {
            result.push(i);
        }
    }
    return result;
}

function filterPlaces(interests, wishes) {
    wishes &= ~(4 | 8 | 16 | 32);
    return _placesArr.filter(place => {
        const placeInterest = place.interests !== undefined ? place.interests : 0;
        const placeWishes = place.wishes !== undefined ? place.wishes : 0;
    
        const priceWish = wishes & 0b11;
        const placeWish = wishes & (64|128);
        const ovzWish = wishes & 256;
    


        return (interests & placeInterest)  // interests 
            
                && (priceWish & placeWishes) === priceWish && (placeWish & placeWishes) === placeWish && (ovzWish & placeWishes) === ovzWish; // wishes
    });
}

function getCenterCoord(places) {
    let x = places[0].coordinates[0];
    let y = places[0].coordinates[1];

    for (let i = 1; i < places.length; ++i) {
        x += places[i].coordinates[0];
        y += places[i].coordinates[1];
    }

    x /= places.length;
    y /= places.length;
    return [x, y];
}

function distanceSq(place1, place2) {
    const p1 = place1.coordinates;
    const p2 = place2.coordinates;
    return Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2);
}

function removeItem(arr, i) {
    arr[i] = arr[arr.length-1];
    arr.pop();
}

function sortPlaces(places, startFrom) {
    let sorted = [startFrom];

    while (places.length > 1) {
        let p0 = sorted[sorted.length-1];
        
        let target = null;
        let targetI = 0;
        let targetDst = 100000;

        for (let i = 0; i < places.length; ++i) {
            let p1 = places[i];
            let newDst = distanceSq(p0, p1);
            if (newDst < targetDst) {
                target = p1;
                targetI = i;
                targetDst = newDst;
            }
        }

        sorted.push(target);
        removeItem(places, targetI);
    }

    if (places.length > 0) {
        sorted.push(places[0]);
    }

    return sorted;
}


function generateMapboxDirectionApiLink(places, movement, token) {
    const coordinates = places.map(place => place.coordinates);
    //console.log(coordinates[0] === places[0].coordinates);
    return `https://api.mapbox.com/directions/v5/mapbox/${movement}/${coordinates.join(";")}?steps=true&geometries=geojson&access_token=${token}`
}