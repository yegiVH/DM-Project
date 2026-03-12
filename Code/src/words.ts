const WORDS = {
  easy: [
    {
      word: "banana",
      clues: [
        "It is something you can eat.",
        "It is a fruit.",
        "It has a yellow peel.",
        "It is long and curved.",
        "Monkeys love to eat it."
      ]
    },
    {
      word: "pizza",
      clues: [
        "It is a popular food.",
        "It comes from Italy.",
        "It usually has cheese.",
        "It has tomato sauce and toppings.",
        "It is round and cut into slices."
      ]
    },
    {
      word: "snowman",
      clues: [
        "It appears in winter.",
        "Children like making it.",
        "It is built outside.",
        "It is made of snow.",
        "It often has a carrot nose."
      ]
    },
    {
      word: "butterfly",
      clues: [
        "It is a small animal.",
        "It is an insect.",
        "It has wings.",
        "Its wings are colorful.",
        "It starts life as a caterpillar."
      ]
    },
    {
      word: "rainbow",
      clues: [
        "You can see it in the sky.",
        "It appears after rain.",
        "It is made by sunlight and water.",
        "It has many colors.",
        "It has seven colors."
      ]
    },
    {
      word: "dog",
      clues: [
        "It is an animal.",
        "It is a common pet.",
        "It barks.",
        "People walk it in parks.",
        "It is called man's best friend."
      ]
    },
    {
      word: "cake",
      clues: [
        "It is a sweet food.",
        "People eat it at parties.",
        "It is baked in an oven.",
        "It often has frosting.",
        "Birthday candles go on it."
      ]
    },
    {
      word: "ball",
      clues: [
        "It is used in games.",
        "Children play with it.",
        "It is round.",
        "You can throw or kick it.",
        "It is used in sports like football."
      ]
    },
    {
      word: "tree",
      clues: [
        "It grows outside.",
        "It is a plant.",
        "It has leaves and branches.",
        "Birds sit in it.",
        "It has a trunk."
      ]
    },
    {
      word: "car",
      clues: [
        "It is a machine.",
        "People use it to travel.",
        "It has four wheels.",
        "It drives on roads.",
        "People drive it to work."
      ]
    }
  ],

  medium: [
    {
      word: "astronaut",
      clues: [
        "It is a profession.",
        "This person travels far from Earth.",
        "They wear a special suit.",
        "They work in spacecraft.",
        "They travel to space."
      ]
    },
    {
      word: "volcano",
      clues: [
        "It is part of nature.",
        "It looks like a mountain.",
        "It exists in some hot regions.",
        "It can erupt.",
        "Lava comes out of it."
      ]
    },
    {
      word: "guitar",
      clues: [
        "It is a musical instrument.",
        "It is used in many songs.",
        "It has strings.",
        "People play it with their hands.",
        "Rock musicians often play it."
      ]
    },
    {
      word: "pyramid",
      clues: [
        "It is a large structure.",
        "It is very old.",
        "It was built by an ancient civilization.",
        "It has a triangular shape.",
        "Famous ones are in Egypt."
      ]
    },
    {
      word: "penguin",
      clues: [
        "It is a bird.",
        "It cannot fly.",
        "It swims very well.",
        "It lives in cold places.",
        "It lives in Antarctica."
      ]
    },
    {
      word: "camera",
      clues: [
        "It is a device.",
        "People use it to capture moments.",
        "It records images.",
        "Photographers use it.",
        "It takes photos."
      ]
    },
    {
      word: "bridge",
      clues: [
        "It is a structure.",
        "It connects two places.",
        "It is built over water or roads.",
        "Cars and people cross it.",
        "It lets you cross a river."
      ]
    },
    {
      word: "robot",
      clues: [
        "It is a machine.",
        "It can perform tasks.",
        "It can be programmed.",
        "Factories often use them.",
        "Some look like humans."
      ]
    },
    {
      word: "castle",
      clues: [
        "It is a very large building.",
        "It is from medieval times.",
        "It has strong walls.",
        "Kings and queens lived there.",
        "It often has towers."
      ]
    },
    {
      word: "desert",
      clues: [
        "It is a place on Earth.",
        "It is very dry.",
        "It gets little rain.",
        "There is often a lot of sand.",
        "Camels live there."
      ]
    }
  ],

  hard: [
    {
      word: "microscope",
      clues: [
        "It is a scientific instrument.",
        "It is used in laboratories.",
        "Scientists use it in biology.",
        "It magnifies tiny objects.",
        "It lets you see cells."
      ]
    },
    {
      word: "algorithm",
      clues: [
        "It is used in computing.",
        "It solves problems step by step.",
        "Programs rely on it.",
        "It is a sequence of logical instructions.",
        "It is the logic behind software."
      ]
    },
    {
      word: "constellation",
      clues: [
        "It is seen at night.",
        "It is found in the sky.",
        "It is a pattern.",
        "It is made of stars.",
        "Examples include Orion."
      ]
    },
    {
      word: "photosynthesis",
      clues: [
        "It is a natural process.",
        "Plants perform it.",
        "It uses sunlight.",
        "It produces energy for plants.",
        "It turns light into food for plants."
      ]
    },
    {
      word: "pharaoh",
      clues: [
        "It is a historical title.",
        "It existed thousands of years ago.",
        "It belonged to rulers.",
        "It was used in ancient Egypt.",
        "It means the king of Egypt."
      ]
    },
    {
      word: "telescope",
      clues: [
        "It is a scientific tool.",
        "Astronomers use it.",
        "It observes distant objects.",
        "It is used to study space.",
        "It helps see planets and stars."
      ]
    },
    {
      word: "gravity",
      clues: [
        "It is a force.",
        "It exists everywhere in the universe.",
        "It pulls objects together.",
        "It keeps planets in orbit.",
        "It keeps us on Earth."
      ]
    },
    {
      word: "ecosystem",
      clues: [
        "It exists in nature.",
        "It includes living things.",
        "Animals and plants interact there.",
        "They share an environment.",
        "Forests and oceans are examples."
      ]
    },
    {
      word: "philosopher",
      clues: [
        "It is a type of thinker.",
        "They study ideas.",
        "They ask deep questions.",
        "They think about life and knowledge.",
        "Examples include Socrates and Plato."
      ]
    },
    {
      word: "voltage",
      clues: [
        "It is related to electricity.",
        "It exists in circuits.",
        "It measures electrical potential.",
        "Batteries produce it.",
        "It pushes electric current."
      ]
    }
  ]
};


export default WORDS;