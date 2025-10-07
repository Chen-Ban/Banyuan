export const enum GRAPHTYPE  {
    GRAPH = 'GRAPH',
    ANALYTICGRAPH="ANALYTICGRAPH",
    DENSETRAJECTORY = "DENSETRAJECTORY",
    SKETCH = "SKETCH",
    LINE = "LINE",
    ARC = "ARC",
    CIRCLE = "CIRCLE",
    BEZIER = "BEZIER",
    QUADRATIC_BEZIER = "QUADRATIC_BEZIER",
    CUBIC_BEZIER = "CUBIC_BEZIER",
    COMBINED_GRAPH = "COMBINED_GRAPH",
    POLYGON = "POLYGON",
    TRIANGLE = "TRIANGLE",
    RECTANGLE = "RECTANGLE",
    REGULAR_POLYGON = "REGULAR_POLYGON",
    COMPLEX_GRAPH = "COMPLEX_GRAPH",
    MAGNIFYING_GLASS = "MAGNIFYING_GLASS",
    IMAGE = "IMAGE",
    VIDEO = "VIDEO",
    TEXTS = "TEXTS",
    TEXTPARAGRAPH = "TEXTPARAGRAPH",
    TEXTELEMENT = "TEXTELEMENT"
}

// 视图类型枚举
export const enum VIEWTYPE {
    VIEW = 'VIEW',
    TEXSTVIEW = "TEXTVIEW",
    GRAPHVIEW = "GRAPHVIEW",
    IMAGEVIEW = "IMAGEVIEW",
    VIDEOVIEW = "VIDEOVIEW",
    COMBINEDVIEW = "COMBINEDVIEW",
}

// 文字对齐方式枚举
export const enum VERTICALALIGN {
    TOP = 'TOP',
    MIDDLE = 'MIDDLE',
    BOTTOM = 'BOTTOM'
}

export const enum HORIZONTALALIGN {
    LEFT = 'LEFT',
    CENTER = 'CENTER',
    RIGHT = 'RIGHT'
}

// 字体样式枚举
export const enum FontStyle {
    NORMAL = 'normal',
    ITALIC = 'italic',
    OBLIQUE = 'oblique'
}

// 字体粗细枚举
export const enum FontWeight {
    NORMAL = 'normal',
    BOLD = 'bold',
    BOLDER = 'bolder',
    LIGHTER = 'lighter',
    WEIGHT_100 = '100',
    WEIGHT_200 = '200',
    WEIGHT_300 = '300',
    WEIGHT_400 = '400',
    WEIGHT_500 = '500',
    WEIGHT_600 = '600',
    WEIGHT_700 = '700',
    WEIGHT_800 = '800',
    WEIGHT_900 = '900'
}