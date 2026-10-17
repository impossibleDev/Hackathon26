import java.awt.*;
import java.awt.event.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import javax.swing.*;

public class PhysicsSimulator extends JPanel implements ActionListener, KeyListener {
    private static final int WIDTH = 520;
    private static final int HEIGHT = 700;
    private static final double FLOOR_Y = HEIGHT - 60;
    private static final int FRUIT_COUNT = 9;

    private final List<Fruit> fruits = new ArrayList<>();
    private final Timer timer = new Timer(16, this);
    private final Random random = new Random();

    private Fruit currentFruit;
    private int score;
    private int bestScore;
    private boolean gameOver;

    public PhysicsSimulator() {
        setPreferredSize(new Dimension(WIDTH, HEIGHT));
        setBackground(new Color(12, 17, 27));
        setFocusable(true);
        addKeyListener(this);
        resetGame();
        timer.start();
    }

    private void resetGame() {
        fruits.clear();
        score = 0;
        gameOver = false;
        spawnFruit();
    }

    private void spawnFruit() {
        if (gameOver) {
            return;
        }

        int stage = 1 + random.nextInt(3);
        currentFruit = new Fruit(stage, WIDTH / 2.0, -30, 0.0);

        if (fruits.stream().anyMatch(f -> f.y - f.radius < 80)) {
            gameOver = true;
        }
    }

    private static double distance(Fruit a, Fruit b) {
        double dx = a.x - b.x;
        double dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    private void dropFruit() {
        if (currentFruit == null || gameOver) {
            return;
        }

        currentFruit.vx = 0;
        currentFruit.vy = 0;
        fruits.add(currentFruit);
        currentFruit = null;
        mergeMatches();
        spawnFruit();
    }

    private void mergeMatches() {
        boolean merged = true;
        while (merged) {
            merged = false;
            for (int i = 0; i < fruits.size(); i++) {
                for (int j = i + 1; j < fruits.size(); j++) {
                    Fruit a = fruits.get(i);
                    Fruit b = fruits.get(j);

                    if (a.stage == b.stage && distance(a, b) < (a.radius + b.radius) * 0.75) {
                        Fruit mergedFruit = new Fruit(a.stage + 1, (a.x + b.x) / 2.0, (a.y + b.y) / 2.0, 0.0);
                        fruits.remove(i);
                        fruits.remove(j - 1);
                        fruits.add(mergedFruit);
                        score += (a.stage + 1) * 10;
                        bestScore = Math.max(bestScore, score);
                        merged = true;
                        break;
                    }
                }
                if (merged) {
                    break;
                }
            }
        }
    }

    private void updateGame() {
        if (gameOver || currentFruit == null) {
            return;
        }

        Fruit f = currentFruit;
        f.vy += 0.28;
        f.x += f.vx;
        f.y += f.vy;

        if (f.x - f.radius < 12) {
            f.x = 12 + f.radius;
            f.vx *= -0.35;
        }
        if (f.x + f.radius > WIDTH - 12) {
            f.x = WIDTH - 12 - f.radius;
            f.vx *= -0.35;
        }

        for (Fruit other : fruits) {
            double dx = f.x - other.x;
            double dy = f.y - other.y;
            double minDist = f.radius + other.radius + 2;
            if (dx * dx + dy * dy < minDist * minDist) {
                if (f.y >= other.y) {
                    f.y = other.y - other.radius - f.radius + 1;
                    f.vy = 0;
                    dropFruit();
                    return;
                }
            }
        }

        if (f.y + f.radius >= FLOOR_Y) {
            f.y = FLOOR_Y - f.radius;
            f.vy = 0;
            dropFruit();
            return;
        }
    }

    @Override
    public void actionPerformed(ActionEvent e) {
        updateGame();
        repaint();
    }

    private void drawFruit(Graphics2D g2, Fruit fruit) {
        int diameter = (int) (fruit.radius * 2);
        int x = (int) Math.round(fruit.x - fruit.radius);
        int y = (int) Math.round(fruit.y - fruit.radius);

        g2.setColor(fruit.color);
        g2.fillOval(x, y, diameter, diameter);

        g2.setColor(new Color(255, 255, 255, 90));
        g2.fillOval(x + 8, y + 8, diameter / 3, diameter / 3);

        g2.setColor(new Color(0, 0, 0, 120));
        g2.drawOval(x, y, diameter, diameter);
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        g2.setColor(new Color(20, 27, 38));
        g2.fillRect(0, 0, getWidth(), getHeight());

        for (int x = 0; x < WIDTH; x += 40) {
            g2.setColor(new Color(255, 255, 255, 12));
            g2.drawLine(x, 0, x, HEIGHT);
        }
        for (int y = 0; y < HEIGHT; y += 40) {
            g2.setColor(new Color(255, 255, 255, 12));
            g2.drawLine(0, y, WIDTH, y);
        }

        g2.setColor(new Color(95, 130, 180, 160));
        g2.fillRect(0, (int) FLOOR_Y, WIDTH, HEIGHT - (int) FLOOR_Y);

        for (Fruit fruit : fruits) {
            drawFruit(g2, fruit);
        }

        if (currentFruit != null) {
            drawFruit(g2, currentFruit);
        }

        if (gameOver) {
            g2.setColor(new Color(0, 0, 0, 170));
            g2.fillRect(70, 250, WIDTH - 140, 150);
            g2.setColor(Color.WHITE);
            g2.setFont(new Font("SansSerif", Font.BOLD, 32));
            g2.drawString("GAME OVER", 150, 315);
            g2.setFont(new Font("SansSerif", Font.BOLD, 20));
            g2.drawString("Press R to restart", 155, 360);
        }

        g2.setColor(Color.WHITE);
        g2.setFont(new Font("SansSerif", Font.BOLD, 24));
        g2.drawString("Score: " + score, 20, 30);
        g2.drawString("Best: " + bestScore, 330, 30);

        g2.dispose();
    }

    @Override
    public void keyPressed(KeyEvent e) {
        if (currentFruit == null) {
            return;
        }

        int code = e.getKeyCode();
        if (code == KeyEvent.VK_LEFT) {
            currentFruit.vx = -2.5;
        } else if (code == KeyEvent.VK_RIGHT) {
            currentFruit.vx = 2.5;
        } else if (code == KeyEvent.VK_SPACE) {
            dropFruit();
        } else if (code == KeyEvent.VK_R) {
            resetGame();
        }
    }

    @Override public void keyTyped(KeyEvent e) { }
    @Override public void keyReleased(KeyEvent e) { }

    private static class Fruit {
        int stage;
        double x;
        double y;
        double vx;
        double vy;
        double radius;
        Color color;

        Fruit(int stage, double x, double y, double vx) {
            this.stage = stage;
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = 0;
            this.radius = 18 + stage * 8;
            this.color = fruitColor(stage);
        }

        private static Color fruitColor(int stage) {
            switch (stage) {
                case 1: return new Color(246, 203, 92);
                case 2: return new Color(137, 217, 99);
                case 3: return new Color(242, 140, 95);
                case 4: return new Color(180, 111, 247);
                case 5: return new Color(109, 204, 255);
                case 6: return new Color(255, 128, 170);
                case 7: return new Color(255, 206, 84);
                case 8: return new Color(124, 223, 189);
                case 9: return new Color(255, 127, 80);
                default: return Color.WHITE;
            }
        }
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            JFrame frame = new JFrame("Suika-style Game");
            PhysicsSimulator simulator = new PhysicsSimulator();
            frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
            frame.setContentPane(simulator);
            frame.pack();
            frame.setLocationRelativeTo(null);
            frame.setVisible(true);
        });
    }
}
