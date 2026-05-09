import io
import torch
from torchvision import models, transforms
from PIL import Image

# --- MobileNetV2 模型初始化 ---
try:
    model = models.mobilenet_v2(weights=models.MobileNetV2_Weights.DEFAULT)
except AttributeError:
    model = models.mobilenet_v2(pretrained=True)
model.eval()
print("[衣服引擎] MobileNetV2 模型加载完成")


def init_clothing_engine():
    """预热钩子：模型已在模块加载时完成初始化"""
    return True


# --- 层级映射表 ---
CLOTHING_MAP = {
    # ===== 上衣类 =====
    425: ("运动背心", "上衣"),
    438: ("沙滩装", "上衣"),
    446: ("棒球服", "上衣"),
    458: ("防弹背心", "上衣"),
    459: ("皮夹克", "上衣"),
    460: ("雨衣", "上衣"),
    461: ("风衣", "上衣"),
    462: ("夹克", "上衣"),
    463: ("连帽衫", "上衣"),
    464: ("羊毛衫", "上衣"),
    465: ("开衫", "上衣"),
    466: ("毛衣", "上衣"),
    467: ("T恤", "上衣"),
    468: ("POLO衫", "上衣"),
    469: ("汗衫", "上衣"),
    470: ("背心", "上衣"),
    505: ("紧身衣", "上衣"),
    599: ("西装", "上衣"),
    600: ("燕尾服", "上衣"),
    601: ("斗篷", "上衣"),
    602: ("和服", "上衣"),
    603: ("浴袍", "上衣"),
    604: ("僧袍", "上衣"),
    605: ("长袍", "上衣"),
    606: ("纱丽", "上衣"),
    607: ("西装外套", "上衣"),
    610: ("马甲", "上衣"),
    611: ("衬衫", "上衣"),
    612: ("礼服衬衫", "上衣"),
    613: ("休闲衬衫", "上衣"),
    614: ("牛津衬衫", "上衣"),
    615: ("正装衬衫", "上衣"),
    616: ("短袖衬衫", "上衣"),
    617: ("长袖衬衫", "上衣"),
    835: ("毛衣", "上衣"),
    836: ("卫衣", "上衣"),
    837: ("运动衫", "上衣"),
    838: ("球衣", "上衣"),
    839: ("背心", "上衣"),
    840: ("紧身衣", "上衣"),

    # ===== 裤子类 =====
    418: ("工装裤", "裤子"),
    471: ("牛仔裤", "裤子"),
    472: ("休闲裤", "裤子"),
    473: ("西装裤", "裤子"),
    608: ("牛仔裤", "裤子"),
    697: ("睡裤", "裤子"),
    834: ("短裤", "裤子"),
    841: ("运动裤", "裤子"),
    842: ("紧身裤", "裤子"),

    # ===== 裙子/连衣裙类 =====
    419: ("连衣裙", "裙子"),
    420: ("短裙", "裙子"),
    421: ("长裙", "裙子"),
    422: ("半身裙", "裙子"),
    423: ("蓬蓬裙", "裙子"),
    424: ("礼服裙", "裙子"),
    575: ("婚纱", "裙子"),
    793: ("长袍", "裙子"),
    799: ("连衣裙", "裙子"),
    800: ("长裙", "裙子"),

    # ===== 鞋子类 =====
    413: ("运动鞋", "鞋子"),
    414: ("跑鞋", "鞋子"),
    415: ("篮球鞋", "鞋子"),
    430: ("凉鞋", "鞋子"),
    431: ("拖鞋", "鞋子"),
    432: ("高跟鞋", "鞋子"),
    433: ("平底鞋", "鞋子"),
    434: ("靴子", "鞋子"),
    435: ("雪地靴", "鞋子"),
    436: ("马丁靴", "鞋子"),
    437: ("皮鞋", "鞋子"),
    553: ("凉鞋", "鞋子"),
    554: ("运动鞋", "鞋子"),
    555: ("拖鞋", "鞋子"),
    556: ("高跟鞋", "鞋子"),
    557: ("平底鞋", "鞋子"),
    558: ("靴子", "鞋子"),
    559: ("皮鞋", "鞋子"),
    770: ("运动鞋", "鞋子"),
    771: ("跑鞋", "鞋子"),
    772: ("篮球鞋", "鞋子"),

    # ===== 帽子类 =====
    439: ("棒球帽", "帽子"),
    440: ("渔夫帽", "帽子"),
    441: ("针织帽", "帽子"),
    442: ("礼帽", "帽子"),
    443: ("贝雷帽", "帽子"),
    444: ("鸭舌帽", "帽子"),
    445: ("草帽", "帽子"),
    456: ("安全帽", "帽子"),
    457: ("头盔", "帽子"),
    797: ("牛仔帽", "帽子"),
    798: ("毡帽", "帽子"),
    801: ("太阳帽", "帽子"),
    802: ("遮阳帽", "帽子"),

    # ===== 包包类 =====
    417: ("背包", "包包"),
    728: ("手提包", "包包"),
    729: ("单肩包", "包包"),
    730: ("双肩包", "包包"),
    731: ("钱包", "包包"),
    732: ("公文包", "包包"),
    733: ("旅行包", "包包"),
    734: ("行李箱", "包包"),
    735: ("购物袋", "包包"),
    736: ("帆布包", "包包"),
    737: ("斜挎包", "包包"),
    738: ("腰包", "包包"),

    # ===== 其他服饰 =====
    416: ("围裙", "其他"),
    514: ("围巾", "其他"),
    515: ("领带", "其他"),
    516: ("手套", "其他"),
    517: ("袜子", "其他"),
    518: ("皮带", "其他"),
    519: ("腰带", "其他"),
    659: ("手表", "其他"),
    660: ("项链", "其他"),
    661: ("手镯", "其他"),
    662: ("戒指", "其他"),
    663: ("耳环", "其他"),
}

# ImageNet 原始标签列表（用于未映射类别返回原始名称）
IMAGENET_LABELS = [
    "tench", "goldfish", "great white shark", "tiger shark", "hammerhead shark",
    "electric ray", "stingray", "cock", "hen", "ostrich", "brambling", "goldfinch",
    "house finch", "junco", "indigo bunting", "robin", "bulbul", "jay", "magpie",
    "chickadee", "water ouzel", "kite", "bald eagle", "vulture", "great grey owl",
    "European fire salamander", "common newt", "eft", "spotted salamander", "axolotl",
    "bullfrog", "tree frog", "tailed frog", "loggerhead", "leatherback turtle", "mud turtle",
    "terrapin", "box turtle", "banded gecko", "common iguana", "American chameleon",
    "whiptail", "agama", "frilled lizard", "alligator lizard", "Gila monster", "green lizard",
    "African chameleon", "Komodo dragon", "African crocodile", "American alligator",
    "triceratops", "thunder snake", "ringneck snake", "hognose snake", "green snake",
    "king snake", "garter snake", "water snake", "vine snake", "night snake", "boa constrictor",
    "rock python", "Indian cobra", "green mamba", "sea snake", "horned viper", "diamondback",
    "sidewinder", "trilobite", "harvestman", "scorpion", "black widow", "tarantula", "wolf spider",
    "garden spider", "black grouse", "ptarmigan", "ruffed grouse", "prairie chicken", "peacock",
    "quail", "partridge", "African grey parrot", "macaw", "sulphur-crested cockatoo", "lorikeet",
    "coucal", "bee eater", "hornbill", "hummingbird", "jacamar", "toucan", "drake", "red-breasted merganser",
    "goose", "black swan", "tusker", "echidna", "platypus", "wallaby", "koala", "wombat", "jellyfish",
    "sea anemone", "brain coral", "flatworm", "nematode", "conch", "snail", "slug", "sea cucumber",
    "sea urchin", "starfish", "brittle star", "sea cucumber", "daisy", "yellow lady's slipper",
    "corn", "acorn", "hip", "buckeye", "coral fungus", "agaric", "gyromitra", "stinkhorn", "earthstar",
    "hen-of-the-woods", "bolete", "ear", "toilet tissue", "web site", "comic book", "crossword puzzle",
    "street sign", "traffic light", "book jacket", "menu", "plate", "guacamole", "consomme", "hot pot",
    "trifle", "ice cream", "ice lolly", "French loaf", "bagel", "pretzel", "cheeseburger", "hot dog",
    "mashed potato", "head cabbage", "broccoli", "cauliflower", "zucchini", "spaghetti squash",
    "acorn squash", "butternut squash", "cucumber", "artichoke", "bell pepper", "cardoon", "mushroom",
    "Granny Smith", "strawberry", "orange", "lemon", "fig", "pineapple", "banana", "jackfruit", "custard apple",
    "pomegranate", "hay", "carbonara", "chocolate sauce", "dough", "meat loaf", "pizza", "pot pie",
    "burrito", "red wine", "espresso", "cup", "eggnog", "alp", "ram", "bighorn", "ibex", "hartebeest",
    "impala", "gazelle", "Arabian camel", "llama", "weasel", "mink", "polecat", "black-footed ferret",
    "otter", "skunk", "badger", "armadillo", "three-toed sloth", "orangutan", "gorilla", "chimpanzee",
    "gibbon", "siamang", "guenon", "patas", "baboon", "macaque", "langur", "colobus", "proboscis monkey",
    "marmoset", "capuchin", "howler monkey", "titi", "spider monkey", "squirrel monkey", "madagascar cat",
    "indri", "Indian elephant", "African elephant", "lesser panda", "giant panda", "barracouta", "eel",
    "coho", "rock beauty", "anemone fish", "sturgeon", "gar", "lionfish", "puffer", "abacus", "abaya",
    "academic gown", "accordion", "acoustic guitar", "aircraft carrier", "airliner", "airship", "altar",
    "ambulance", "amphibian", "analog clock", "apiary", "apron", "ashcan", "assault rifle", "backpack",
    "bakery", "balance beam", "balloon", "ballpoint", "Band Aid", "banjo", "bannister", "barbell", "barber chair",
    "barbershop", "barn", "barometer", "barrel", "barrier", "baseball", "basketball", "bassinet", "bassoon",
    "bathing cap", "bath towel", "bathtub", "beach wagon", "beacon", "beaker", "bearskin", "beer bottle",
    "beer glass", "bell cote", "bib", "bicycle-built-for-two", "bikini", "binder", "binoculars", "birdhouse",
    "boathouse", "bobsled", "bolo tie", "bonnet", "bookcase", "bookshop", "bottlecap", "bow", "bow tie",
    "brass", "brassiere", "breakwater", "breastplate", "broom", "bucket", "buckle", "bulletproof vest",
    "bullet train", "butcher shop", "cab", "caldron", "candle", "cannon", "canoe", "can opener", "cardigan",
    "car mirror", "carousel", "carpenter's kit", "carton", "car wheel", "cash machine", "cassette", "castle",
    "catamaran", "CD player", "cello", "cellular telephone", "chain", "chainlink fence", "chain mail",
    "chain saw", "chest", "chiffonier", "chime", "china cabinet", "Christmas stocking", "church", "cinema",
    "cleaver", "cliff dwelling", "cloak", "clog", "cocktail shaker", "coffee mug", "coffeepot", "coil",
    "combination lock", "computer keyboard", "computer mouse", "container ship", "convertible", "corkscrew",
    "cornet", "cowboy boot", "cowboy hat", "cradle", "crane", "crash helmet", "crate", "crib", "croquet ball",
    "crutch", "cuirass", "dam", "desk", "desktop computer", "dial telephone", "diaper", "digital clock",
    "digital watch", "dining table", "dishrag", "dishwasher", "disk brake", "dock", "dogsled", "dome",
    "doormat", "drilling platform", "drum", "drumstick", "dumbbell", "Dutch oven", "electric fan",
    "electric guitar", "electric locomotive", "entertainment center", "envelope", "espresso maker",
    "face powder", "feather boa", "file", "fireboat", "fire engine", "fire screen", "flagpole", "flute",
    "folding chair", "football helmet", "fork", "fountain", "fountain pen", "four-poster", "freight car",
    "French horn", "frying pan", "fur coat", "garbage truck", "gasmask", "gas pump", "goblet", "go-kart",
    "golf ball", "golfcart", "gondola", "gong", "gown", "grand piano", "greenhouse", "grille", "grocery store",
    "guillotine", "hair slide", "hair spray", "half track", "hammer", "hamper", "hand blower", "hand-held computer",
    "handkerchief", "hard disc", "harmonica", "harp", "harvester", "hatchet", "holster", "home theater",
    "honeycomb", "hook", "hoop skirt", "horizontal bar", "horse cart", "hourglass", "iPod", "iron", "jack-o'-lantern",
    "jean", "jeep", "jersey", "jigsaw puzzle", "jinrikisha", "joystick", "kimono", "knee pad", "knot", "lab coat",
    "ladle", "lampshade", "laptop", "lawn mower", "lens cap", "letter opener", "library", "lifeboat", "lighter",
    "limousine", "liner", "lipstick", "lotion", "loudspeaker", "loupe", "lumbermill", "magnetic compass",
    "mailbag", "mailbox", "maillot", "maillot", "manhole cover", "maraca", "marimba", "mask", "matchstick",
    "maypole", "maze", "measuring cup", "medicine chest", "megalith", "microphone", "microwave", "military uniform",
    "milk can", "minibus", "miniskirt", "minivan", "missile", "mitten", "mixing bowl", "mobile home", "modem",
    "monastery", "monitor", "moped", "mortar", "mortarboard", "mosque", "mosquito net", "motor scooter",
    "mountain bike", "mountain tent", "mouse", "mousetrap", "moving van", "muzzle", "nail", "neck brace",
    "necklace", "nipple", "notebook", "obelisk", "oboe", "ocarina", "odometer", "oil filter", "organ",
    "oscilloscope", "overskirt", "paddle", "padlock", "paintbrush", "pajama", "palace", "panpipe", "paper towel",
    "parachute", "parallel bars", "park bench", "parking meter", "passenger car", "patio", "pay-phone",
    "pedestal", "pencil box", "pencil sharpener", "perfume", "Petri dish", "photocopier", "pick", "pickup",
    "pier", "piggy bank", "pill bottle", "pillow", "ping-pong ball", "pinwheel", "pirate", "pitcher",
    "plane", "planetarium", "plastic bag", "plate rack", "plow", "plunger", "Polaroid camera", "pole",
    "police van", "poncho", "pool table", "pop bottle", "pot", "potter's wheel", "power drill", "prayer rug",
    "printer", "prison", "projectile", "projector", "puck", "punching bag", "purse", "quill", "quilt",
    "racer", "racket", "radiator", "radio", "radio telescope", "rain barrel", "recreational vehicle",
    "reel", "reflex camera", "refrigerator", "remote control", "restaurant", "revolver", "rifle", "rocking chair",
    "rotisserie", "rubber eraser", "rugby ball", "rule", "running shoe", "safe", "safety pin", "saltshaker",
    "sandal", "sarong", "sax", "scabbard", "scale", "school bus", "schooner", "scoreboard", "screen",
    "screw", "screwdriver", "seat belt", "sewing machine", "shield", "shoe shop", "shoji", "shopping basket",
    "shopping cart", "shovel", "shower cap", "shower curtain", "ski", "ski mask", "sleeping bag", "slide rule",
    "sliding door", "slot", "snorkel", "snowmobile", "snowplow", "soap dispenser", "soccer ball", "sock",
    "solar dish", "sombrero", "soup bowl", "space bar", "space heater", "space shuttle", "spatula", "speedboat",
    "spider web", "spindle", "sports car", "spotlight", "stage", "steam locomotive", "steel arch bridge",
    "steel drum", "stethoscope", "stole", "stone wall", "stopwatch", "stove", "strainer", "streetcar",
    "stretcher", "studio couch", "stupa", "submarine", "suit", "sundial", "sunglass", "sunglasses", "sunscreen",
    "suspension bridge", "swab", "sweatshirt", "swimming trunks", "swing", "switch", "syringe", "table lamp",
    "tank", "tape player", "teapot", "teddy", "television", "tennis ball", "thatch", "theater curtain",
    "thimble", "thresher", "throne", "tile roof", "toaster", "tobacco shop", "toilet seat", "torch",
    "totem pole", "tow truck", "toy store", "tractor", "trailer truck", "tray", "trench coat", "tricycle",
    "trimaran", "tripod", "triumphal arch", "trolleybus", "trombone", "tub", "turnstile", "typewriter",
    "umbrella", "unicycle", "upright", "vacuum", "vase", "vault", "velvet", "vending machine", "vestment",
    "viaduct", "violin", "volleyball", "waffle iron", "wall clock", "wallet", "wardrobe", "warplane",
    "washbasin", "washer", "water bottle", "water jug", "water tower", "whiskey jug", "whistle", "wig",
    "window screen", "window shade", "Windsor tie", "wine bottle", "wing", "wok", "wooden spoon", "wool",
    "worm fence", "wreck", "yawl", "yurt", "web site", "comic book", "crossword puzzle", "street sign",
    "traffic light", "book jacket", "menu", "plate", "guacamole", "consomme", "hot pot", "trifle",
    "ice cream", "ice lolly", "French loaf", "bagel", "pretzel", "cheeseburger", "hot dog", "mashed potato",
    "head cabbage", "broccoli", "cauliflower", "zucchini", "spaghetti squash", "acorn squash", "butternut squash",
    "cucumber", "artichoke", "bell pepper", "cardoon", "mushroom", "Granny Smith", "strawberry", "orange",
    "lemon", "fig", "pineapple", "banana", "jackfruit", "custard apple", "pomegranate", "hay", "carbonara",
    "chocolate sauce", "dough", "meat loaf", "pizza", "pot pie", "burrito", "red wine", "espresso", "cup",
    "eggnog"
]


def get_clothing_info(class_idx):
    info = CLOTHING_MAP.get(class_idx)
    if info:
        return info[0], info[1], class_idx

    if 0 <= class_idx < len(IMAGENET_LABELS):
        raw_name = IMAGENET_LABELS[class_idx]
        return raw_name, "待分类", class_idx

    return "未知单品", "未分类", class_idx


def predict_category(img_byte_arr):
    try:
        img = Image.open(io.BytesIO(img_byte_arr)).convert('RGB')
        preprocess = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        input_tensor = preprocess(img).unsqueeze(0)

        with torch.no_grad():
            output = model(input_tensor)

        _, predicted_idx = torch.max(output, 1)
        idx = predicted_idx.item()

        print(f"AI 识别原始索引: {idx}")
        sub_tag, category, raw_index = get_clothing_info(idx)
        return sub_tag, category, raw_index
    except Exception as e:
        print(f"分类失败: {e}")
        return "未知单品", "未分类", -1
